import { NextResponse } from 'next/server';
import { initialProfile } from '@/lib/profile';

/** The client asks for the starting profile once, then owns it. */
export async function GET() {
  return NextResponse.json(initialProfile());
}
