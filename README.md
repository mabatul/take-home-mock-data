# take-home-mock-data

A complete code base for the **Loan Application** take-home test: a full-stack flow where a user fills a form, a rule engine decides approve/deny, approved applications are saved transactionally, and a background event sends the same data to an external (mock) service over HTTP.

## Stack

| Part | Technology |
|---|---|
| Backend | .NET 10 (C#), ASP.NET Core, EF Core, SQLite |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| External service | Node.js / Express mock on port `3001` |

## Repository layout

```
Take-Home Test/
├── backend/
│   └── LoanApplication/
│       ├── LoanApplication.slnx
│       ├── src/
│       │   ├── LoanApplication.Api/            # Controller, DI, config
│       │   ├── LoanApplication.Core/           # Domain + business rules (rule engine)
│       │   └── LoanApplication.Infrastructure/ # EF Core, repository, events, HTTP client
│       └── tests/
│           └── LoanApplication.Tests/          # Unit + integration tests
├── frontend/                                   # Next.js app
└── mock-service/                               # Express mock external service
```

## How to run everything locally

You need **.NET 10 SDK** and **Node.js** (LTS) installed.

### 1. Backend (port 5175)

```bash
cd backend/LoanApplication
dotnet restore
dotnet run --project src/LoanApplication.Api
```

The API listens on `http://localhost:5175`. Swagger UI: `http://localhost:5175/swagger`.
The SQLite database file (`LoanApplication.db`) is created and migrated automatically on startup.

### 2. Mock external service (port 3001)

```bash
cd mock-service
npm install
npm start
```

### 3. Frontend (port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## How to run the tests

```bash
cd backend/LoanApplication
dotnet test
```

The tests use an **in-memory SQLite** database and a **fake of the external service** — they do not depend on the mock on port 3001 or on a real database.

- **Unit tests** cover `DeniedStatesRule`, `SsnBlacklistRule`, and `RuleEngine`.
- **Integration tests** (`WebApplicationFactory`) cover the `/api/Loan` endpoint, the returning-customer path (updates, no duplicates), and the create/update events sent to the external service.

## Test data

| What you type | Result |
|---|---|
| State = `NY` (any casing) | **Denied** (denied by state rule) |
| SSN on the blacklist | **Denied** (denied by blacklist rule) |
| Any other valid data (e.g. State = `CA`, SSN = `222-33-4444`) | **Approved** (new customer) |
| Submit the **same SSN twice** | **Approved** — returning customer: existing customer & application are updated, no duplicates |

### Blacklisted SSNs

```
123-45-6789
987-65-4321
111-22-3333
```

### Examples

- **Approved (new):** First name `John`, Last name `Doe`, Address `123 Main St`, State `CA`, Company `Acme Corp`, Amount `5000`, SSN `222-33-4444`
- **Denied by state:** same as above but State = `NY`
- **Denied by SSN:** same as above but SSN = `123-45-6789`
- **Returning customer:** submit the same SSN (`222-33-4444`) a second time — update the requested amount or name to see it reflected

## Notes

- No authentication (not required).
- Denied states and blacklisted SSNs are **configurable** in `backend/LoanApplication/src/LoanApplication.Api/appsettings.json`.
- See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and trade-offs.
