

# Fix: Open Graph / Link Preview Showing Lovable Branding

## Problem
In `index.html`, the OG and Twitter meta tags use Lovable's default image and Twitter handle:
- `og:image` → `https://lovable.dev/opengraph-image-p98pqg.png` (Lovable logo)
- `twitter:image` → same Lovable image
- `twitter:site` → `@lovable_dev`

This is why WhatsApp (and any social platform) shows the Lovable preview when sharing smbconnect.in.

## Fix in `index.html`

Update lines 19 and 22-23:

1. **`og:image`** → Point to the SMB Connect logo at `/smb-connect-logo.png` (already exists in `public/`). Use the full absolute URL: `https://smbconnect.in/smb-connect-logo.png`
2. **`twitter:image`** → Same absolute URL
3. **`twitter:site`** → Update to SMB Connect's Twitter handle (or remove if none exists)
4. **Add `og:url`** → `https://smbconnect.in`

Note: After deploying, social platforms cache OG images. WhatsApp may take time to refresh. You can force re-scrape on Facebook via the [Sharing Debugger](https://developers.facebook.com/tools/debug/).

## Files Changed
- `index.html` — update OG image URLs and Twitter handle

