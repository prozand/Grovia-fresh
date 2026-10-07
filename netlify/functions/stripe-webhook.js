const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    
    // The farmId was passed via client_reference_id in the Payment Link URL
    const farmId = session.client_reference_id;

    if (farmId) {
      try {
        const { error } = await supabase
          .from('farms')
          .update({ Active: true })
          .eq('id', farmId);

        if (error) {
          console.error(`Error updating farm ${farmId}:`, error);
          return { statusCode: 500, body: 'Database Error' };
        }
        
        console.log(`Successfully activated farm ${farmId}`);
      } catch (err) {
        console.error('Error in webhook handling:', err);
        return { statusCode: 500, body: 'Internal Server Error' };
      }
    } else {
      console.warn('Checkout completed but no client_reference_id found.');
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
