# Architecture

## Project structure

Clean architecture with dependencies pointing inward. The API project (outermost) references Core (innermost) and Infrastructure; Infrastructure references Core; Core references nothing.

```
src/
├── LoanApplication.Core/           # No external dependencies
│   ├── Domain/                     # Customer, Application entities
│   ├── Dtos/                       # ApplicationDto (request payload)
│   ├── Rules/                      # IApplicationRule, RuleEngine, DeniedStatesRule, SsnBlacklistRule
│   └── Interfaces/                 # IApplicationRepository, IExternalService
├── LoanApplication.Infrastructure/ # Replaceable infrastructure
│   ├── Data/                       # EF Core DbContext (SQLite)
│   ├── Repositories/               # ApplicationRepository (EF Core)
│   ├── Services/                   # ExternalService (HTTP client to the mock)
│   └── Events/                     # Channel-based publisher + BackgroundService processor
└── LoanApplication.Api/            # Thin controller + DI wiring + config
    └── Controllers/LoanController.cs
```

- **Core** owns the business rules (the rule engine). It has no dependency on EF Core, ASP.NET, or HTTP — rules operate on the DTO only.
- **Infrastructure** is replaceable: swap EF Core SQLite for another provider, or swap the HTTP external service for a fake (which is exactly what the integration tests do).
- **Api** is thin: the controller delegates to the repository, rule engine, and event publisher.

---

## Rule engine

`IApplicationRule` (`LoanApplication.Core/Rules/IApplicationRule.cs`):

```csharp
public interface IApplicationRule
{
    string Name { get; }
    Task<RuleResult> EvaluateAsync(ApplicationDto application);
}
```

`RuleEngine.EvaluateAsync` iterates the injected rules and returns the **first** denying result; if none deny, the application is approved. Rules are injected via DI as `IApplicationRule`, each reading its config (denied states / blacklisted SSNs) from `appsettings.json`.

Two rules exist:
- `DeniedStatesRule` — denies when the application state is in a configurable list (default `["NY"]`).
- `SsnBlacklistRule` — denies when the SSN is in a configurable blacklist.

### How to add a new rule

1. Create a class implementing `IApplicationRule` in `LoanApplication.Core/Rules`.
2. Register it in `Program.cs` alongside the existing ones:

```csharp
builder.Services.AddScoped<IApplicationRule>(sp =>
{
    var config = builder.Configuration.GetSection("YourConfig").Get<string[]>() ?? ...;
    return new YourNewRule(config);
});
```

No existing rule or the `RuleEngine` needs to change — new rules plug in without touching old ones (Open/Closed).

---

## Background event → external service

The HTTP request must not be blocked by the outbound call, so publishing and processing are decoupled with a **channel**:

1. `LoanController` posts an `ApplicationEvent(customer, application, isReturningCustomer)` to `ApplicationEventPublisher` (an unbounded `Channel<T>` singleton). This happens **inside** the transaction.
2. `ApplicationEventProcessor` (a `BackgroundService`) drains the channel and asynchronously calls the external service:
   - **New customer** → `POST /api/customers` and `POST /api/applications`
   - **Returning customer** → `PUT /api/customers/{id}` and `PUT /api/applications/{id}`

The `ExternalService` is an `IExternalService` implementation using `HttpClient` (registered via `AddHttpClient`) pointed at the mock (`http://localhost:3001`). Errors are logged but do not fail the durable save — the request already returned. The mock simply receives the payload and returns 200.

**Why a channel / hosted service instead of `Task.Run` in the controller?** It keeps the request handler focused on its unit of work, survives as long as the process, and gives a single processing loop with straightforward lifecycle handling at shutdown.

---

## Transaction handling

Approval is one unit of work (`LoanController.SubmitApplication`):

```
BeginTransaction
  look up customer by SSN
  insert OR update customer
  insert OR update application
  publish event to channel          # in-memory, so it cannot "fail" against the DB
CommitTransaction
```

- **Customer + Application are saved inside an explicit EF Core transaction.** If saving either fails, `RollbackAsync` undoes everything — no half-saved customer, no orphan application.
- The event is **published to an in-memory channel inside the transaction**. Publishing to a channel is effectively non-failing, so the transaction/save is not broken by it. If you wanted durable exactly-once guarantees you'd use an outbox table + a record of published events — deliberately left out (see Trade-offs).

The returning-customer path uses the same transaction: it updates the existing customer (name/address/etc.) and the existing application (e.g. requested amount) rather than inserting duplicates. The `isReturningCustomer` flag is carried into the event so the external service receives **update** calls.

---

## Tests

- **Unit tests** (`tests/.../Unit`): `DeniedStatesRule`, `SsnBlacklistRule`, `RuleEngine` — fast, pure logic.
- **Integration tests** (`tests/.../Integration`): spin up the full API via `WebApplicationFactory<Program>` with an **in-memory SQLite** database and a **fake `IExternalService`** (in-memory call tracking). They cover:
  - `/api/Loan` end-to-end (approved, denied by state, denied by blacklisted SSN).
  - Returning-customer path (same SSN → same customer & application, updated, no duplicates).
  - Create vs. update events sent to the external service.

The tests do **not** depend on the mock on port 3001 or on a real database, so they are deterministic and run offline. Unique SSNs per test keep tests isolated; the shared factory is grouped in a non-parallel xUnit collection to avoid cross-test interference from the background channel.

---

## Trade-offs (chosen to keep it simple)

- **SQLite over SQL Server/PostgreSQL** — meets the real-transaction requirement with zero setup, easy for a take-home.
- **In-memory channel instead of a durable message broker** — no RabbitMQ/Kafka infrastructure required. Accepts that a process crash between publish and send would lose the event; noted as a real (non-production) limitation.
- **No outbox pattern / no retry queue** — the spec asked for create/update relay, not guaranteed delivery. Errors are logged. Documented rather than built.
- **No authentication, no seed data, no Docker** — not required by the spec; adding them would not earn their place in a take-home.
- **Single `LoanController`** — one flow, no need for separate customer/application controllers.
- **Configurable `DeniedStates` list instead of a hard-coded "NY" rule** — the "deny NY" spec became a generic, configurable deny-by-state rule with `["NY"]` as default, reusing the same pattern as the SSN blacklist. Adding states later is a config change, not a code change.
- **EF Core code-first migrations** applied on startup — convenient for local dev; in production you'd run migrations explicitly.
