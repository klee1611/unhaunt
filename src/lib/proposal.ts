import type { Proposal } from './ledger';

// One template for every deletion request, whoever chose the recipient.
export function draftProposal(id: string, displayName: string, to: string, toSource: Proposal['toSource']): Proposal {
  return {
    id,
    to,
    toSource,
    subject: 'Account and personal data deletion request',
    body: [
      'Hello,',
      '',
      `Please delete my ${displayName} account associated with this email address, and the personal information you hold about me, as provided under applicable privacy law (including Canada's PIPEDA).`,
      '',
      'Please confirm by email once the deletion is complete.',
      '',
      'Thank you.',
    ].join('\n'),
    status: 'drafted',
  };
}
