## Workshop Links
Bedrock with Claude Code: https://catalog.us-east-1.prod.workshops.aws/join?access-code=e771-043055-7e

Diving Deep into Bedrock AgentCore: https://catalog.us-east-1.prod.workshops.aws/join?access-code=6be9-0ebf12-3a   


## Set Up Claude Code UI with your Bedrock Keys
Click Ctrl(Cmd) + Shift + P, Open User Settings JSON in VS Code.

Add this

"claudeCode.environmentVariables": [
  { "name": "CLAUDE_CODE_USE_BEDROCK", "value": "1" },
  { "name": "AWS_REGION", "value": "us-west-2" },
  { "name": "AWS_ACCESS_KEY_ID", "value": "your-key-id" },
  { "name": "AWS_SECRET_ACCESS_KEY", "value": "your-secret" }
]