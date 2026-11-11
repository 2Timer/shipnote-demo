# Shipnote — 5-minute assignment video

Replace the bracketed sections with your own details. Keep the final cut to 4:30–4:50 so there is room for natural pauses.

## 0:00–0:45 — Who I am

“Hi, I’m [name]. I’m applying for the Founder’s Office, Product & Growth role at Volopay. I’m a [one-line background]. I enjoy turning messy customer context into simple tools people actually use. That is why I built Shipnote.”

“Shipnote is a customer-facing changelog for software teams. The team uses Claude for the thinking and writing; Shipnote owns the durable work after the chat: saving the release note, letting a human edit it, and keeping it live for customers.”

## 0:45–1:15 — Best work

“One piece of work I’m proud of is [project]. The starting problem was [problem]. I [what you did], which led to [measurable result — growth, time saved, revenue, adoption, or users]. The lesson I took from it is that a product wins when it makes the last mile—the part customers actually experience—much simpler.”

## 1:15–2:15 — Why Shipnote wins

“Product teams already ask Claude to summarise a launch. But a good answer in a chat is not a customer-facing release process. It disappears into a conversation, has no stable URL, has no review point, and cannot be cleanly edited later.”

“Shipnote is for early-stage SaaS founders and product teams who ship often but do not have time for a heavyweight changelog system. They paste the facts into Claude, and Claude drafts a release note using the team’s existing subscription. Shipnote saves a real draft, gives it an editor, and hosts the approved update at a permanent link.”

“The wedge is intentionally narrow: release notes only. That makes it clearer than asking Claude for general writing, and simpler than adopting a full product-marketing suite.”

## 2:15–4:15 — Live demo

1. “First, I connect Shipnote to Claude using this MCP endpoint. There is no AI key here—this is just the connection that lets Claude call Shipnote’s actions.”
2. In Claude, type:

   > Create a Shipnote release for version 2.4. It adds SSO and fixes a slow dashboard. Make it a draft. The customer benefit is simpler access and faster reporting.

3. “Claude does the reasoning and writing in the customer’s own Claude account. It calls Shipnote’s `create_release` tool.”
4. Open the returned Shipnote edit link. “Here is the real draft. It is not a mockup and it does not live in the chat.”
5. Change the headline or customer takeaway in Shipnote. “This is the human review moment. I can change the wording directly in the app.”
6. Change visibility to **Published**, save, then click **Preview**. “Now the release has a customer-ready public URL. Shipnote keeps this live after the Claude chat is gone.”
7. Optional: return to Claude and ask it to list the release or revise one paragraph, showing that the draft stays editable through both Claude and the app.

## 4:15–5:00 — Economics and growth

“The AI cost to Shipnote is zero. The customer’s existing Claude plan pays for the writing, and Shipnote does not carry an OpenAI, Anthropic, or other model key. The marginal cost is storage and hosting, which is cents per active workspace at this stage.”

“I would start at $19 per month for a solo founder and $79 per month for a small product team. The first 100 customers come from founder-led outbound: short before-and-after demos to indie SaaS founders, Product Hunt launch teams, and product communities where people already share release notes.”

“At one year, the target is 350 paying teams at a blended $35 per month—about $12,000 MRR. At three years, Shipnote can grow into the place where customer-facing product history lives: 5,000 teams at a blended $45 is roughly $225,000 MRR, while model cost remains zero.”

“Shipnote is deliberately small today: one workflow done end to end. Claude creates it, a person edits it, and customers can read it live. Thank you.”
