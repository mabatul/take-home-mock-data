const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory storage
const customers = {};
const applications = {};

// Root endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'mock-external-service' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create customer
app.post('/api/customers', (req, res) => {
  const customer = req.body;
  customers[customer.id] = customer;
  console.log('Customer created:', customer.id);
  res.status(201).json(customer);
});

// Update customer
app.put('/api/customers/:id', (req, res) => {
  const { id } = req.params;
  const customer = req.body;
  customers[id] = customer;
  console.log('Customer updated:', id);
  res.json(customer);
});

// Get customer
app.get('/api/customers/:id', (req, res) => {
  const { id } = req.params;
  const customer = customers[id];
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(customer);
});

// Create application
app.post('/api/applications', (req, res) => {
  const application = req.body;
  applications[application.id] = application;
  console.log('Application created:', application.id);
  res.status(201).json(application);
});

// Update application
app.put('/api/applications/:id', (req, res) => {
  const { id } = req.params;
  const application = req.body;
  applications[id] = application;
  console.log('Application updated:', id);
  res.json(application);
});

// Get application
app.get('/api/applications/:id', (req, res) => {
  const { id } = req.params;
  const application = applications[id];
  if (!application) {
    return res.status(404).json({ error: 'Application not found' });
  }
  res.json(application);
});

// List all customers
app.get('/api/customers', (req, res) => {
  res.json(Object.values(customers));
});

// List all applications
app.get('/api/applications', (req, res) => {
  res.json(Object.values(applications));
});

module.exports = app;

// Only listen when run directly (local dev), not when used as a Vercel handler
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Mock external service running on http://localhost:${PORT}`);
  });
}
