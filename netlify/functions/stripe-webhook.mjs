import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Stripe signs the raw request body, so it must be read as text before parsing
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;

    if (session.payment_status !== 'paid') {
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // add.html passes the farm's id to the Payment Link as client_reference_id
    const farmId = session.client_reference_id;
    if (!farmId) {
      console.error(`Session ${session.id} has no client_reference_id; cannot match a farm`);
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const { data, error } = await supabase
      .from('farms')
      .update({ Active: true })
      .eq('id', farmId)
      .select('id');

    if (error) {
      console.error(`Supabase update failed for farm ${farmId}:`, error.message);
      // Non-2xx makes Stripe retry the event later
      return new Response('Database update failed', { status: 500 });
    }

    if (!data || data.length === 0) {
      console.error(`No farm found with id ${farmId} (session ${session.id})`);
    } else {
      console.log(`Activated farm ${farmId} from session ${session.id}`);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
};
