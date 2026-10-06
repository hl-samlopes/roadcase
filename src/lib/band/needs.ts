/** A band setup's extra needs as short phrases, for the input list and emails. */
export function bandNeeds(setup: {
  inEarMonitors: boolean;
  clickTrack: boolean;
  expectedChannels: number | null;
  notes: string | null;
}): string[] {
  return [
    ...(setup.inEarMonitors ? ["In-ear monitors"] : []),
    ...(setup.clickTrack ? ["Click track"] : []),
    ...(setup.expectedChannels ? [`The group expects ${setup.expectedChannels} channels`] : []),
    ...(setup.notes ? [setup.notes] : []),
  ];
}
