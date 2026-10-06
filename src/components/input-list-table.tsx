import { connectionLabels, type Channel } from "@/lib/band/input-list";

/** An input list as a table: channel number, source, input type, stand and notes. */
export function InputListTable({ channels, label }: { channels: Channel[]; label: string }) {
  if (channels.length === 0) return <p>No channels yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table aria-label={label} className="w-full border-collapse">
        <thead>
          <tr className="border-border text-muted border-b text-left">
            <th className="p-2">Ch</th>
            <th className="p-2">Source</th>
            <th className="p-2">Input</th>
            <th className="p-2">Stand</th>
            <th className="p-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((channel, index) => (
            <tr key={index} className="border-border border-b last:border-0">
              <td className="p-2">{index + 1}</td>
              <td className="p-2">{channel.source}</td>
              <td className="p-2">{connectionLabels[channel.connection]}</td>
              <td className="p-2">{channel.stand}</td>
              <td className="p-2">{channel.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
