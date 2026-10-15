---
name: Attachment commit scope
description: Default handling for files the user attaches to this project.
---

Keep user-supplied attachments out of commits by default.

**Why:** the user said more attachments will be sent and asked for them to stay out of commits by default.

**How to apply:** Stage source and documentation paths explicitly; leave new files in `attached_assets/` unstaged unless the user says otherwise.
