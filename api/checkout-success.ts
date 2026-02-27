import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-01-27.acacia'
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Retrieve checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Handle successful payment - update user subscription
    if (session.payment_status === 'paid') {
      // Here you would update your database to reflect the active subscription
      const customerId = session.customer as string;

      console.log('Payment successful for customer:', customerId);
    }

    res.status(200).json({ 
      success: true, 
      sessionId,
      customerEmail: session.customer_email 
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Checkout success error:', message);
    res.status(500).json({ error: message || 'Something went wrong' });
  }
}
