import { NextResponse } from "next/server";

export function ok(data, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function created(data) {
  return ok(data, 201);
}

export function fail(message, status = 400, details = undefined) {
  return NextResponse.json({ success: false, error: { message, details } }, { status });
}

export function getSearchParam(request, name) {
  return new URL(request.url).searchParams.get(name);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
