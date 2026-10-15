# Admin content editor

Administrators can open **Operations > Website content editor** in the signed-in web portal.

1. Choose a page, Homepage hero, or product photo.
2. Edit the heading and introduction, or upload a PNG/JPEG photo up to 5 MB.
3. Add an accessibility description for the photo and review the draft preview.
4. Select **Publish changes** to save. Blank text uses the original wording. **Reset to original content** restores the original text/artwork for that location.

Draft text is local to the open form: publish before changing location or leaving the page. Uploaded images are private to administrators until published; published images are available to signed-in users. Removing an image from a page retains its stored file. Back up both the database and uploads directory. Concurrent changes are rejected rather than silently overwritten.

The editor changes page introductions, headings, banners and product photos. It does not edit navigation, page layouts, login branding, native app screens, or every paragraph within dashboard widgets. Product names, pricing and inventory remain in **Manage your community > Products**. There is no revision-history interface or permanent media deletion in this version.

**Manage your community > Programs** now includes Archive and Restore. Archiving hides the program from web/native signup lists and blocks new registrations and waitlist offers, while preserving registrations and schedules. Restore reopens access subject to the program's other eligibility rules.

Validation (October 15, 2026): 115 automated tests pass, including administrator-only editing, upload restrictions, protected file access, publication/reset access changes, stale edits and archived-program enrollment/waitlist protection. Web production build and iOS/Android exports pass. Local browser publication and reset were exercised successfully. Physical-phone testing and live-provider acceptance remain separate launch work.
