# Brand assets

Source files supplied by the owner for tenant branding in stage three (Part B) and for
the invoice screen and PDF (Part C). One folder per tenant.

- `lamo/`: LAMO Distributor. Logo or word mark (SVG preferred, otherwise a PNG at least
  600 pixels wide with a transparent background), plus the primary and accent colours as
  hex values in `lamo/colours.txt`.

The files in the tenant folders are not committed: this repository is public and the
assets belong to the client. The app does not read them from here. At build-out they are
uploaded to Supabase Storage and the colours are saved on the tenant's row.
