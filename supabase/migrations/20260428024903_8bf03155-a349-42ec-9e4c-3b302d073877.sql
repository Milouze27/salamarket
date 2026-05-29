CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  unit text NOT NULL CHECK (unit IN ('kg','piece','pack')),
  category text NOT NULL,
  image_url text NOT NULL,
  in_stock boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products are viewable by everyone"
  ON public.products FOR SELECT
  USING (true);

CREATE INDEX idx_products_category ON public.products(category);

INSERT INTO public.products (name, description, price_cents, unit, category, image_url) VALUES
('Entrecôte de bœuf halal','Entrecôte tendre, certifiée halal, élevage français.',1890,'kg','boucherie','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Entrec%C3%B4te'),
('Escalope de poulet fermier','Filet de poulet fermier label rouge, halal.',1290,'kg','boucherie','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Poulet'),
('Cacher dinde fumée','Tranches fines de dinde fumée halal.',399,'pack','charcuterie','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Dinde+fum%C3%A9e'),
('Merguez artisanales','Merguez maison épicées, halal.',1450,'kg','charcuterie','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Merguez'),
('Riz Basmati 5kg','Riz basmati premium, grain long.',1290,'pack','epicerie','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Riz+Basmati'),
('Huile d''olive vierge extra 1L','Huile d''olive vierge extra, première pression à froid.',890,'piece','epicerie','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Huile+olive'),
('Yaourt nature x8','Pack de 8 yaourts nature au lait entier.',299,'pack','frais','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Yaourts'),
('Nuggets de poulet halal','Nuggets surgelés, poulet 100% halal.',599,'pack','surgele','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Nuggets'),
('Tomates grappe','Tomates grappe origine France.',349,'kg','fruits-legumes','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Tomates'),
('Bananes équitables','Bananes du commerce équitable.',219,'kg','fruits-legumes','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Bananes'),
('Jus de pomme artisanal 1L','Jus de pomme pressé, sans sucre ajouté.',349,'piece','boissons','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Jus+pomme'),
('Liquide vaisselle écologique','Liquide vaisselle écolabel, 750ml.',399,'piece','bazar','https://placehold.co/400x400/0F4C3A/D4A574/png?text=Liquide+vaisselle');