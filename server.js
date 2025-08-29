require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');

const app = express();
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.error('Missing STRIPE_SECRET_KEY environment variable. Please check your .env file.');
  process.exit(1);
}
const stripe = Stripe(stripeSecretKey);

app.use(express.json());
app.use(cors());

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Create a Stripe Connect Account
app.post('/create-connect-account', async (req, res) => {
    const { email, type } = req.body;
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email,
        capabilities: { 
          transfers: { requested: true },
          card_payments: { requested: true }
        },
        business_type: type === 'business' ? 'company' : 'individual',
      });
      res.json({ accountId: account.id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

// Generate an onboarding link for a Connect Account
app.post('/onboard-connect-account', async (req, res) => {
  const { accountId } = req.body;
  console.log("req.body", req.body)
  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: 'http://localhost:4200/reauth',
      return_url: 'http://localhost:4200/return',
      type: 'account_onboarding',
    });
    res.json({ url: accountLink.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create checkout session to add funds to platform
app.post('/create-checkout-session', async (req, res) => {
  const { amount = 10000 } = req.body; // Default $20.00 or custom amount
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Deposit Funds' },
            unit_amount: amount, // amount in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}`,
      cancel_url: `${process.env.FRONTEND_URL}`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// **NEW: Transfer funds to a specific connected account**
app.post('/transfer-funds', async (req, res) => {
  const { amount, connectedAccountId, description = 'Platform transfer' } = req.body;
  console.log("req.body", req.body)
  
  if (!amount || !connectedAccountId) {
    return res.status(400).json({ error: 'Amount and connectedAccountId are required' });
  }

  try {
    // First, verify the connected account exists and is active
    const account = await stripe.accounts.retrieve(connectedAccountId);
    console.log("account", account)
    
    if (!account.charges_enabled ||                 // can't accept payments
      account.capabilities?.transfers !== 'active' || // transfers capability not active
      !account.payouts_enabled    ) {
      return res.status(400).json({ 
        error: 'Connected account is not fully activated for transfers' 
      });
    }

    // Create a transfer to the connected account
    const transfer = await stripe.transfers.create({
      amount: amount * 100, // Convert to cents
      currency: 'usd',
      destination: connectedAccountId,
      description: description,
      metadata: {
        transfer_type: 'platform_to_user',
        timestamp: new Date().toISOString()
      }
    });
    console.log("transfer", transfer)
    res.json({ 
      success: true,
      transfer: {
        id: transfer.id,
        amount: transfer.amount / 100,
        destination: transfer.destination,
        created: transfer.created
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// **NEW: Get connected account balance**
app.get('/account-balance/:accountId', async (req, res) => {
  const { accountId } = req.params;
  
  try {
    const balance = await stripe.balance.retrieve({
      stripeAccount: accountId
    });
    
    res.json({ 
      available: balance.available,
      pending: balance.pending,
      accountId: accountId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// **NEW: Delete a specific connected account**
app.delete('/delete-account/:accountId', async (req, res) => {
  console.log('DELETE request received for accountId:', req.params.accountId);
  const { accountId } = req.params;
  
  if (!accountId) {
    return res.status(400).json({ error: 'Account ID is required' });
  }

  try {
    // First verify the account exists
    const account = await stripe.accounts.retrieve(accountId);
    
    // Check if account has any pending balances
    const balance = await stripe.balance.retrieve({
      stripeAccount: accountId
    });
    
    const totalAvailable = balance.available.reduce((sum, bal) => sum + bal.amount, 0);
    const totalPending = balance.pending.reduce((sum, bal) => sum + bal.amount, 0);
    
    if (totalAvailable > 0 || totalPending > 0) {
      return res.status(400).json({ 
        error: `Cannot delete account with remaining balance. Available: $${totalAvailable/100}, Pending: $${totalPending/100}. Please withdraw all funds first.` 
      });
    }

    // Delete the account
    const deletedAccount = await stripe.accounts.del(accountId);
    
    res.json({ 
      success: true,
      deleted: deletedAccount.deleted,
      accountId: accountId,
      message: 'Account successfully deleted'
    });
  } catch (err) {
    if (err.code === 'resource_missing') {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.status(500).json({ error: err.message });
  }
});

// **UPDATED: Proper payout implementation**
app.post('/create-payout', async (req, res) => {
  const { amount, connectedAccountId, method = 'standard' } = req.body;
  
  if (!amount || !connectedAccountId) {
    return res.status(400).json({ error: 'Amount and connectedAccountId are required' });
  }

  try {
    // Check account balance first
    const balance = await stripe.balance.retrieve({
      stripeAccount: connectedAccountId
    });

    const availableAmount = balance.available.reduce((sum, bal) => sum + bal.amount, 0);
    const requestedAmount = amount * 100; // Convert to cents

    if (availableAmount < requestedAmount) {
      return res.status(400).json({ 
        error: `Insufficient funds. Available: $${availableAmount/100}, Requested: $${amount}` 
      });
    }

    // Create payout to connected account's bank
    const payout = await stripe.payouts.create({
      amount: requestedAmount,
      currency: 'usd',
      method: method, // 'standard' or 'instant'
      metadata: {
        payout_type: 'user_withdrawal',
        timestamp: new Date().toISOString()
      }
    }, {
      stripeAccount: connectedAccountId
    });

    res.json({ 
      success: true,
      payout: {
        id: payout.id,
        amount: payout.amount / 100,
        status: payout.status,
        arrival_date: payout.arrival_date,
        method: payout.method
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// **NEW: List all connected accounts**
app.get('/connected-accounts', async (req, res) => {
  try {
    const accounts = await stripe.accounts.list({ limit: 100 });
    
    const accountsInfo = accounts.data.map(account => ({
      id: account.id,
      email: account.email,
      created: account.created,
      charges_enabled: account.charges_enabled,
      transfers_enabled: account.transfers_enabled,
      type: account.type
    }));

    res.json({ accounts: accountsInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// **NEW: Get transfer history for an account**
app.get('/transfer-history/:accountId', async (req, res) => {
  const { accountId } = req.params;
  
  try {
    // Get transfers TO this account
    const incomingTransfers = await stripe.transfers.list({
      destination: accountId,
      limit: 50
    });

    // Get payouts FROM this account
    const payouts = await stripe.payouts.list({
      limit: 50
    }, {
      stripeAccount: accountId
    });

    res.json({
      incoming_transfers: incomingTransfers.data,
      payouts: payouts.data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));