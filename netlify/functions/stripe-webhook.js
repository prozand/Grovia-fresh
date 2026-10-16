const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with your service role key to securely bypass RLS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    // Securely verify that the event came from Stripe
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }

  // Listen for a completed checkout session
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const customerEmail = session.customer_details?.email;

    console.log(`Checkout completed successfully for: ${customerEmail}`);

    if (customerEmail) {
      // Update the farm listing in Supabase to active
      const { error } = await supabase
        .from('farms')
        .update({ Active: true })
        .eq('Email', customerEmail);

      if (error) {
        console.error('Supabase update error:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: error.message }),
        };
      }

      console.log(`Successfully set Active = true for ${customerEmail}`);
    } else {
      console.warn('Checkout completed, but no customer email was provided.');
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
