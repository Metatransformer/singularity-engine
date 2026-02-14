# Pre-Launch Checklist

## Security & Infrastructure

- [ ] API rate limiting / DDOS protection (API Gateway throttling, WAF)
- [ ] metatransformer.com DDOS protection (Vercel handles this, but check settings)
- [ ] API Gateway usage plan with throttle limits
- [ ] CloudWatch alarms for Lambda errors/throttles
- [ ] DynamoDB on-demand capacity (auto-scales) vs provisioned
- [ ] Input validation on all API endpoints
- [ ] CORS restricted to known domains (currently wildcard *)
