# Shipnote submission checklist

1. Deploy the app using `render.yaml` or another Node host with a persistent disk. Set `APP_URL` to the deployed address after the URL is assigned.
2. Open `/connect` on the live app and add its `/mcp` URL as a custom Claude connector.
3. Run the exact demo in `Shipnote-video-script.md` and record a 4:30–4:50 video.
4. Open the live app in an incognito window and confirm the published release URL loads without any login.
5. Send Volopay:
   - the video link;
   - the live app link;
   - the MCP URL, written as `https://your-app.example/mcp`;
   - the note: “The app is intentionally login-free for review. Create a draft from Claude, edit it in Shipnote, then change visibility to Published and preview its public URL.”

## What reviewers can test

In Claude: “Create a Shipnote release for version 2.4. It adds SSO and fixes a slow dashboard. Make it a draft.”

Then in Shipnote: edit the release, set visibility to Published, save, and open the public page.
