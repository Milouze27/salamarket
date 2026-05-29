-- 1. Ajouter 'preparing' au CHECK constraint des status orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'confirmed'::text,
    'preparing'::text,
    'ready'::text,
    'picked_up'::text,
    'cancelled'::text
  ]));

-- 2. Promouvoir le compte client-test en employee pour les tests
UPDATE public.profiles
SET role = 'employee', updated_at = now()
WHERE id = 'd39bbd17-89c4-4897-b2fd-be293a781b61';

-- 3. Vérification (à lancer manuellement dans le SQL Editor)
-- SELECT id, email, role FROM public.profiles WHERE role IN ('admin','employee');
