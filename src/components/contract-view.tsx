import type { ReactNode } from "react";
import type { ContractDoc, ContractNode, Mark } from "@/lib/contracts/document";

/**
 * Renders a contract document. Only allow-listed node types exist (see
 * src/lib/contracts/document.ts), React escapes all text, and nothing here
 * sets raw HTML, so a template can't inject markup.
 */
function withMarks(text: string, marks: Mark[] = []): ReactNode {
  return marks.reduce<ReactNode>((inner, mark) => {
    if (mark.type === "bold") return <strong>{inner}</strong>;
    if (mark.type === "italic") return <em>{inner}</em>;
    return <u>{inner}</u>;
  }, text);
}

function renderNodes(nodes: ContractNode[] = []): ReactNode[] {
  return nodes.map((node, index) => <Node key={index} node={node} />);
}

function Node({ node }: { node: ContractNode }): ReactNode {
  switch (node.type) {
    case "doc":
      return <>{renderNodes(node.content)}</>;
    case "text":
      return withMarks(node.text, node.marks);
    case "hardBreak":
      return <br />;
    case "horizontalRule":
      return <hr />;
    case "paragraph":
      return <p>{renderNodes(node.content)}</p>;
    case "heading": {
      // Contract headings sit under the page's own h1, so they start at h2.
      const Tag = (["h2", "h3", "h4"] as const)[node.attrs.level - 1];
      return <Tag className={`level-${node.attrs.level}`}>{renderNodes(node.content)}</Tag>;
    }
    case "bulletList":
      return <ul>{renderNodes(node.content)}</ul>;
    case "orderedList":
      return <ol start={node.attrs?.start}>{renderNodes(node.content)}</ol>;
    case "listItem":
      return <li>{renderNodes(node.content)}</li>;
    case "table":
      return (
        <table>
          <tbody>{renderNodes(node.content)}</tbody>
        </table>
      );
    case "tableRow":
      return <tr>{renderNodes(node.content)}</tr>;
    case "tableHeader":
    case "tableCell": {
      const Tag = node.type === "tableHeader" ? "th" : "td";
      return (
        <Tag colSpan={node.attrs?.colspan} rowSpan={node.attrs?.rowspan}>
          {renderNodes(node.content)}
        </Tag>
      );
    }
  }
}

export function ContractView({ doc, label }: { doc: ContractDoc; label: string }) {
  return (
    <article aria-label={label} className="contract">
      <Node node={doc} />
    </article>
  );
}
