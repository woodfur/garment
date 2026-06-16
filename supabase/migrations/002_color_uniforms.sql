-- Colour-based uniform pieces
-- A uniform may be defined by a colour swatch instead of a photographed garment.
-- These pieces feed the AI preview as a text prompt (Flux) rather than image try-on.
-- image_url / raw_image_url are already nullable, so a colour piece simply leaves them null.

alter table public.uniforms
  add column if not exists color text,
  add column if not exists color_label text;

comment on column public.uniforms.color is 'Hex colour (e.g. #3A6B8C) for colour-based pieces; null for photo pieces.';
comment on column public.uniforms.color_label is 'Optional human name for the colour (e.g. "Baltic Sea").';
