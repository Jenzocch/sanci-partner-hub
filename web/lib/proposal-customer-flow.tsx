import type { ReactNode } from "react";
import styles from "./proposal-customer-flow.module.css";

/**
 * Customer-facing chapter policy shared by admin and cabang Proposal.
 * Keeps ProposalDocument as the single source of data/rendering truth while
 * presenting the shorter owner-approved reading order:
 * Cover -> Selection + pricing -> Product stories.
 */
export default function ProposalCustomerFlow({ children }: { children: ReactNode }) {
  return <div className={styles.flow}>{children}</div>;
}
