import { NextResponse } from 'next/server';

/**
 * Cookies are no longer managed from the control panel.
 * The sync daemon runs locally on the Mac Mini and uses
 * cookies exported directly from the local browser.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message: 'I cookies non vengono più gestiti dal pannello. Il sync gira in locale sul Mac Mini con i cookies del browser locale.',
    },
    { status: 410 } // Gone
  );
}
