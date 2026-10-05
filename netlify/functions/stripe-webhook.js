const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const farmId = session.client_reference_id;

    if (farmId) {
      try {
        const { error } = await supabase
          .from('farms')
          .update({ Active: true })
          .eq('id', farmId);

        if (error) {
          console.error('Error updating Supabase:', error);
          return { statusCode: 500, body: 'Error updating database' };
        }
        
        console.log(`Successfully activated farm ID: ${farmId}`);
      } catch (err) {
         console.error('Unexpected error updating database:', err);
         return { statusCode: 500, body: 'Unexpected database error' };
      }
    } else {
        console.log('No client_reference_id found in session.');
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
