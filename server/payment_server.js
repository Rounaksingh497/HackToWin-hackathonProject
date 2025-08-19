// server.js

// --- 1. DEPENDENCIES ---
// IMPORTANT: dotenv must be configured at the very top
require('dotenv').config(); 

const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const mongoose = require('mongoose'); // MongoDB object modeling tool

// --- 2. INITIALIZATION ---
const app = express();
// Now, process.env.STRIPE_SECRET_KEY will have a value when Stripe is initialized.
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// --- 3. DATABASE CONNECTION ---
// Connect to your MongoDB database.
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected successfully.'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- 4. DATABASE SCHEMA (MODEL) ---
// Define the structure for a payment record in the database.
const paymentSchema = new mongoose.Schema({
    stripePaymentId: { type: String, required: true, unique: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, required: true, default: 'pending' }, // e.g., pending, succeeded, failed
    createdAt: { type: Date, default: Date.now },
});
const Payment = mongoose.model('Payment', paymentSchema);


// --- 5. MIDDLEWARE ---
// Use a different middleware for the webhook endpoint.
// It needs the raw request body to verify the Stripe signature.
app.use((req, res, next) => {
    if (req.originalUrl === '/stripe-webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});
app.use(cors());


// --- 6. API ENDPOINTS ---

// A. Create a payment intent and save an initial record to the database.
app.post('/create-payment-intent', async (req, res) => {
    try {
        const { amount, currency = 'inr' } = req.body;

        if (!amount) {
            return res.status(400).send({ error: 'Amount is required.' });
        }

        // Create a PaymentIntent with Stripe
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency,
            automatic_payment_methods: { enabled: true },
        });

        // Create a corresponding payment record in our database with 'pending' status.
        const newPayment = new Payment({
            stripePaymentId: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: 'pending',
        });
        await newPayment.save();

        // Send the client_secret back to the frontend to complete the payment.
        res.send({
            clientSecret: paymentIntent.client_secret,
        });

    } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ error: error.message });
    }
});


// B. Stripe Webhook Handler to confirm payments.
// Stripe sends events here to notify us of payment status changes.
app.post('/stripe-webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // Verify the event came from Stripe
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.log(`Webhook signature verification failed.`, err.message);
        return res.sendStatus(400);
    }

    // Handle the event
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntentSucceeded = event.data.object;
            // Find the payment in our database and update its status to 'succeeded'.
            await Payment.findOneAndUpdate(
                { stripePaymentId: paymentIntentSucceeded.id },
                { status: 'succeeded' }
            );
            console.log(`Payment succeeded for ${paymentIntentSucceeded.id}`);
            break;
        
        case 'payment_intent.payment_failed':
            const paymentIntentFailed = event.data.object;
            // Find the payment in our database and update its status to 'failed'.
             await Payment.findOneAndUpdate(
                { stripePaymentId: paymentIntentFailed.id },
                { status: 'failed' }
            );
            console.log(`Payment failed for ${paymentIntentFailed.id}`);
            break;
        
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.send();
});


// --- 7. START THE SERVER ---
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
