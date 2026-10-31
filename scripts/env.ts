import { config } from 'dotenv';

// Scripts read the same settings as the Next.js app.
config({ path: ['.env.local', '.env'], quiet: true });
