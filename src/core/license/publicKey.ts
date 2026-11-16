/**
 * Public half of Kitroid's license signing key (P-256 ECDSA). Safe to publish.
 * The private half is created by scripts/license/keygen.mjs and must never be committed.
 */
export const LICENSE_PUBLIC_JWK: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'kIb9WG8U2t5ixzMZjAAS042KTOHDPjeRpfzJvAY22a4',
  y: 'zwgM5J6n_eMq9ZU1N6hzSxQLrW5Gx8jyRYrSZGkCXLU',
}
