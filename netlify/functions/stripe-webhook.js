const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
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

  // Listen for completed checkout sessions (works for both payments and subscriptions)
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    
    const customerEmail = session.customer_details?.email || session.customer_email;
    const clientRefId = session.client_reference_id;

    console.log(`Webhook received! Email: ${customerEmail}, Client Ref ID: ${clientRefId}`);

    let updateError = null;

    // Option A: If we have a client_reference_id (like row ID 106), update by ID!
    if (clientRefId) {
      const { error } = await supabase
        .from('farms')
        .update({ Active: true })
        .eq('id', clientRefId);

      updateError = error;
    } 
    // Option B: Fallback to updating by email if no client reference ID exists
    else if (customerEmail) {
      const { error } = await supabase
        .from('farms')
        .update({ Active: true })
        .eq('Email', customerEmail);

      updateError = error;
    } else {
      console.warn('Checkout completed, but neither client_reference_id nor email was found.');
    }

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: updateError.message }),
      };
    } else {
      console.log('Successfully set Active = true in Supabase!');
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
