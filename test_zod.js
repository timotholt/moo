import { z } from 'zod';
import fs from 'fs';

const TimestampSchema = z.string().datetime();
const data = '2026-07-11T03:29:04.995112Z';

try {
  TimestampSchema.parse(data);
  console.log("Success");
} catch(err) {
  console.error(err);
}
