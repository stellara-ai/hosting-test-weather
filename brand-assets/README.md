# Brand assets

Source files supplied by the owner for tenant branding in stage three (Part B) and for
the invoice screen and PDF (Part C). One folder per tenant.

- `lamo/`: LAMO Distributor. Logo or word mark (SVG preferred, otherwise a PNG at least
  600 pixels wide with a transparent background), plus the primary and accent colours as
  hex values in `lamo/colours.txt`.

As supplied for LAMO (2026-11-17): light- and dark-mode word marks and logos as PNG, and
`LAMO distributor brand board.png` with the colours (no `colours.txt`). Copies resized to 1,000 pixels
wide (`lamo-wordmark-*-1000.png`) are the ones uploaded, because the originals exceed the
1 MB limit of the `tenant-assets` bucket. Updated 2026-11-18: the dark-mode word mark
now reads "LAMO", matching the light one.

The files in the tenant folders are not committed: this repository is public and the
assets belong to the client. The app does not read them from here. At build-out they are
uploaded to Supabase Storage and the colours are saved on the tenant's row.
