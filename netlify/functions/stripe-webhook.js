const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with service role key (or anon key) to update database rows
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event, context) => {
  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    // Verify the webhook signature to ensure the request genuinely came from Stripe
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }

  // Handle the successful checkout session event
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const customerEmail = session.customer_details?.email;

    console.log(`Checkout completed successfully for email: ${customerEmail}`);

    if (customerEmail) {
      // 1. Try updating the 'farms' table
      const { error: farmError } = await supabase
        .from('farms')
        .update({ Active: true })
        .eq('Email', customerEmail);

      if (farmError) {
        console.error('Supabase farms update error:', farmError);
      } else {
        console.log(`Successfully activated farm listing for ${customerEmail}`);
      }

      // 2. Try updating the 'advertisers' table (just in case it was an ad spot)
      const { error: adError } = await supabase
        .from('advertisers')
        .update({ active: true })
        .eq('email', customerEmail);

      if (adError) {
        console.error('Supabase advertisers update error:', adError);
      } else {
        console.log(`Successfully activated advertiser listing for ${customerEmail}`);
      }
    } else {
      console.warn('Checkout session completed, but no customer email was found.');
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
