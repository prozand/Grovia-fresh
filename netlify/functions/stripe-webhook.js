const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  // Initialize Stripe inside the handler using current environment variables
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('CRITICAL: STRIPE_SECRET_KEY is missing from Netlify environment variables!');
    return { statusCode: 500, body: 'Server configuration error: Stripe key missing.' };
  }
  const stripe = require('stripe')(stripeKey);

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const clientRefId = session.client_reference_id;
    const customerEmail = session.customer_details?.email || session.customer_email;

    console.log(`Webhook received! Client Ref ID: ${clientRefId}, Email: ${customerEmail}`);

    if (clientRefId) {
      const { error } = await supabase
        .from('farms')
        .update({ Active: true })
        .eq('id', clientRefId);

      if (error) {
        console.error('Supabase update error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      }
      console.log(`Successfully set Active = true for farm ID ${clientRefId}`);
    } else {
      console.warn('No client_reference_id found on session.');
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
