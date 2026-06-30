/**
 * /api/resume/transform
 * Generates a tailored resume copy in Google Drive.
 * Called internally from the Slack webhook or directly.
 *
 * Body: { baseResume: 'agile-pm' | 'tpm', title: string, company: string }
 */

const { generateResume } = require('../../lib/resume');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { baseResume = 'agile-pm', title, company } = req.body;

  try {
    const url = await generateResume({ baseResume, title, company });
    res.status(200).json({ url });
  } catch (err) {
    console.error('Transform error:', err);
    res.status(500).json({ error: err.message });
  }
}
