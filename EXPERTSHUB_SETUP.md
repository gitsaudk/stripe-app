# ExpertsHub Marketplace Setup Guide

## Overview
This is a complete Stripe-powered marketplace for ExpertsHub where:
- **Clients** deposit funds into the platform account
- **Freelancers** receive transfers for completed work
- All transactions are tracked in the database

## Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create/update your `.env` file:
```env
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 3. Start the Server
```bash
npm run server
```

### 4. Database
The SQLite database (`expertshub.db`) will be created automatically on first run.

## Architecture

### Database Schema
- **users**: Stores both clients and freelancers
- **transactions**: Tracks all money movements
- **projects**: (For future expansion) Work assignments

### Stripe Integration
- **Clients**: Use Stripe Customers for deposits
- **Freelancers**: Use Stripe Connect Express accounts
- **Platform**: Receives deposits, facilitates transfers

## API Endpoints

### Client Management

#### Register Client
```http
POST /clients/register
```
```json
{
  "email": "client@example.com",
  "first_name": "John",
  "last_name": "Doe"
}
```

#### Client Deposit
```http
POST /clients/deposit
```
```json
{
  "client_id": 1,
  "amount": 100,
  "description": "Adding funds to account"
}
```

### Freelancer Management

#### Register Freelancer
```http
POST /freelancers/register
```
```json
{
  "email": "freelancer@example.com",
  "first_name": "Jane",
  "last_name": "Smith",
  "business_type": "individual"
}
```

#### Freelancer Onboarding
```http
POST /freelancers/onboard
```
```json
{
  "freelancer_id": 2
}
```

### Transfers & Payments

#### Transfer Client to Freelancer
```http
POST /transfers/client-to-freelancer
```
```json
{
  "client_id": 1,
  "freelancer_id": 2,
  "amount": 50,
  "description": "Payment for web development"
}
```

#### Freelancer Payout
```http
POST /freelancers/payout
```
```json
{
  "freelancer_id": 2,
  "amount": 45,
  "method": "standard"
}
```

### Reporting

#### Get All Clients
```http
GET /clients
```

#### Get All Freelancers
```http
GET /freelancers
```

#### Get User Transactions
```http
GET /users/:userId/transactions?type=deposit
```

#### Platform Statistics
```http
GET /platform/stats
```

## Usage Flow

### For Clients:
1. Register via `/clients/register`
2. Deposit funds via `/clients/deposit` (redirects to Stripe Checkout)
3. Funds are tracked in client balance after successful payment
4. Transfer funds to freelancers via `/transfers/client-to-freelancer`

### For Freelancers:
1. Register via `/freelancers/register`
2. Complete onboarding via `/freelancers/onboard` (Stripe Connect flow)
3. Receive transfers from clients
4. Request payouts via `/freelancers/payout`

## Webhooks Setup

In your Stripe Dashboard:
1. Go to Developers → Webhooks
2. Add endpoint: `http://your-domain.com/webhooks/stripe`
3. Select event: `checkout.session.completed`
4. Copy webhook signing secret to `.env`

## Frontend Integration

Update your routes to handle the new flow:
- `/return?freelancer_id=X` - Freelancer onboarding complete
- `/success?client_id=X&amount=Y` - Client deposit success

## Security Notes

1. **Webhook Verification**: Always verify webhook signatures
2. **User Validation**: Check user types before operations
3. **Balance Checks**: Verify balances before transfers
4. **Database Validation**: Use transactions for critical operations

## Database Queries Examples

```javascript
// Get client balance
const client = await dbHelpers.getUserById(clientId);
console.log(`Balance: $${client.balance_cents / 100}`);

// Get all transactions for a user
const transactions = await dbHelpers.getTransactionsByUser(userId);

// Create transaction record
await dbHelpers.createTransaction({
  type: 'transfer',
  from_user_id: clientId,
  to_user_id: freelancerId,
  amount_cents: amount * 100,
  stripe_transaction_id: transfer.id,
  status: 'completed',
  description: 'Payment for services'
});
```

## Error Handling

All endpoints include proper error handling for:
- Invalid user types
- Insufficient balances
- Stripe API errors
- Database constraints

## Next Steps

1. Add authentication/authorization
2. Implement project management
3. Add dispute resolution
4. Create admin dashboard
5. Add email notifications
6. Implement escrow system for projects

## Testing

Use Stripe test cards:
- Success: `4242424242424242`
- Decline: `4000000000000002`

## Support

For issues with this marketplace implementation, check:
1. Database connection
2. Stripe credentials
3. Webhook configuration
4. Network connectivity
