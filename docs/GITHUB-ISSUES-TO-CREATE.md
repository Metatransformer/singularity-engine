# GitHub Issues to Create

Run these commands to populate the issue tracker. Review and adjust before running.

```bash
gh issue create --repo Metatransformer/singularity-engine --title "Iteration: tell bot to improve existing builds" --body "Allow users to reply to a build tweet and request changes (e.g. 'make the colors darker', 'add a leaderboard'). The bot should fetch the existing source, apply changes, and redeploy.\n\nThis is the #1 most requested feature." --label "enhancement"

gh issue create --repo Metatransformer/singularity-engine --title "API-driven apps: real backends, not just static" --body "Currently all builds are static HTML/JS/CSS. Add support for per-app API endpoints so apps can have real server-side logic.\n\nApproach: generate a Lambda or lightweight backend per app, route through API Gateway." --label "enhancement"

gh issue create --repo Metatransformer/singularity-engine --title "Faster deploys: target <20s end-to-end" --body "Current build pipeline takes 30-60s. Profile and optimize each stage:\n- Parse & plan\n- Code generation\n- GitHub deploy\n- Pages propagation\n\nGoal: <20s from tweet to live URL." --label "enhancement"

gh issue create --repo Metatransformer/singularity-engine --title "Multi-channel input: Telegram, Discord, OpenClaw" --body "Singularity Engine should work beyond X/Twitter. Add input adapters for:\n- Telegram bot\n- Discord bot\n- OpenClaw skill\n- Mesh protocol\n\nArchitecture: shared build pipeline, pluggable input/output adapters." --label "enhancement"

gh issue create --repo Metatransformer/singularity-engine --title "Private repos: private source code + hosting" --body "Allow users to deploy to private GitHub repos. Source code should not be publicly visible.\n\nRequires: private repo creation, alternative hosting (not GitHub Pages for private), auth layer." --label "enhancement"

gh issue create --repo Metatransformer/singularity-engine --title "Dashboard MVP: view builds, source, logs" --body "Web dashboard where users can:\n- See all their builds\n- View source code\n- Read build logs\n- Copy/share URLs\n\nSimple React app, pulls from existing builds API." --label "enhancement"

gh issue create --repo Metatransformer/singularity-engine --title "Pay-for-more-builds: Stripe integration" --body "Monetization layer:\n- Free tier: N builds/day\n- Paid tier: unlimited builds, priority queue, private repos\n- Stripe Checkout integration\n- Usage tracking in DynamoDB" --label "enhancement"

gh issue create --repo Metatransformer/singularity-engine --title "Multi-user auth per app" --body "Let generated apps have their own user authentication. Session-based auth so apps can have multiple users with separate data.\n\nApproach: generate auth boilerplate into apps, backed by DynamoDB user table per namespace." --label "enhancement"

gh issue create --repo Metatransformer/singularity-engine --title "Kubernetes portability: Helm chart" --body "Package Singularity Engine as a Helm chart so it can run on any Kubernetes cluster, not just AWS Lambda.\n\nReplace Lambda with containerized functions, DynamoDB with pluggable DB (MongoDB, Postgres)." --label "enhancement"

gh issue create --repo Metatransformer/singularity-engine --title "Improve code generation quality" --body "Reduce broken builds and improve output quality:\n- Better prompts with examples\n- Validation step before deploy\n- Auto-fix common errors (missing closing tags, broken JS)\n- Test suite for generated code" --label "enhancement"
```
