const INCIDENT_SUMMARY_REPORT = Object.freeze({
  id: 'incident-summary',
  name: 'Incident Summary Report',
  icon: 'fa-chart-line',
  description: 'Incident totals, timing, and citywide summary.',
  audience: 'Operations',
  range: 'Flexible',
  available: true,
  scopeLabel: 'Source scope',
  supportedDateRanges: ['today', '7d', '30d', 'month', 'custom'],
  supportedSourceScopes: ['all', 'mesh', 'online'],
  supportedOutputModes: ['briefing', 'archive', 'field'],
  include: [
    {
      id: 'incident-counts',
      label: 'Incident counts',
      description: 'Totals for all incidents in the selected date range.',
      defaultSelected: true
    },
    {
      id: 'source-breakdown',
      label: 'Source breakdown',
      description: 'Counts split between mesh-origin and online incidents.',
      defaultSelected: true
    },
    {
      id: 'status-breakdown',
      label: 'Status breakdown',
      description: 'Active, canceled, and accomplished incident totals.',
      defaultSelected: true
    },
    {
      id: 'response-timing',
      label: 'Response timing',
      description: 'Average response and incident closure duration.',
      defaultSelected: true
    },
    {
      id: 'reason-breakdown',
      label: 'Reason breakdown',
      description: 'Top distress reasons from the selected incident set.',
      defaultSelected: true
    },
    {
      id: 'recent-incidents',
      label: 'Recent incident table',
      description: 'Latest incidents with deployment and team context.',
      defaultSelected: true
    }
  ]
});

const RESCUE_TEAM_ACTIVITY_REPORT = Object.freeze({
  id: 'rescue-team-activity',
  name: 'Rescue Team Activity Report',
  icon: 'fa-people-group',
  description: 'Team workload, response performance, and deployment activity.',
  audience: 'Team supervisors',
  range: 'Daily to monthly',
  available: true,
  scopeLabel: 'Source scope',
  supportedDateRanges: ['today', '7d', '30d', 'month', 'custom'],
  supportedSourceScopes: ['all', 'mesh', 'online'],
  supportedOutputModes: ['briefing', 'archive', 'field'],
  include: [
    {
      id: 'team-deployment-totals',
      label: 'Team deployment totals',
      description: 'Deployment totals and outcome counts by rescue team.',
      defaultSelected: true
    },
    {
      id: 'team-response-performance',
      label: 'Team response performance',
      description: 'Average, fastest, slowest, and duration timing by team.',
      defaultSelected: true
    },
    {
      id: 'team-source-coverage',
      label: 'Team source coverage',
      description: 'Mesh and online deployment mix handled by each team.',
      defaultSelected: true
    },
    {
      id: 'team-reason-coverage',
      label: 'Team reason coverage',
      description: 'Top distress reasons handled by each rescue team.',
      defaultSelected: true
    },
    {
      id: 'recent-team-activity',
      label: 'Recent team activity',
      description: 'Latest deployments with team, leader, source, and status context.',
      defaultSelected: true
    },
    {
      id: 'team-roster-snapshot',
      label: 'Team roster snapshot',
      description: 'Current team, leader, member count, and responder status summary.',
      defaultSelected: true
    }
  ]
});

const ACCOUNTS_ACCESS_AUDIT_REPORT = Object.freeze({
  id: 'accounts-access-audit',
  name: 'Accounts and Access Audit Report',
  icon: 'fa-user-lock',
  description: 'Account lifecycle, access actions, and session activity.',
  audience: 'Compliance',
  range: 'Daily to monthly',
  available: true,
  scopeLabel: 'Account scope',
  supportedDateRanges: ['today', '7d', '30d', 'month', 'custom'],
  supportedSourceScopes: ['all', 'civilian', 'rescuer'],
  supportedOutputModes: ['briefing', 'archive', 'field'],
  include: [
    {
      id: 'registration-intake',
      label: 'Registration intake',
      description: 'New civilian registrations and rescuer profiles created in the selected window.',
      defaultSelected: true
    },
    {
      id: 'account-status-breakdown',
      label: 'Account status breakdown',
      description: 'Current civilian status mix and rescuer access mix.',
      defaultSelected: true
    },
    {
      id: 'admin-access-actions',
      label: 'Admin access actions',
      description: 'Approvals, declines, suspensions, reactivations, and rescuer account actions.',
      defaultSelected: true
    },
    {
      id: 'login-session-activity',
      label: 'Login session activity',
      description: 'Successful mobile session issuances and revocations by account type.',
      defaultSelected: true
    },
    {
      id: 'rescuer-access-roster',
      label: 'Rescuer access roster',
      description: 'Current rescuer roster with agency, access status, operational status, and team.',
      defaultSelected: true
    },
    {
      id: 'recent-access-events',
      label: 'Recent access events',
      description: 'Latest admin account-governance actions with actor, subject, reason, and time.',
      defaultSelected: true
    }
  ]
});

const MESH_DEVICE_SYNC_HEALTH_REPORT = Object.freeze({
  id: 'mesh-device-sync-health',
  name: 'Mesh Device and Sync Health Report',
  icon: 'fa-tower-broadcast',
  description: 'Node readiness, sync health, telemetry snapshots, and command queue state.',
  audience: 'Technical operations',
  range: 'Daily to monthly',
  available: true,
  scopeLabel: 'Node scope',
  supportedDateRanges: ['today', '7d', '30d', 'month', 'custom'],
  supportedSourceScopes: ['all', 'active', 'offline'],
  supportedOutputModes: ['briefing', 'archive', 'field'],
  include: [
    {
      id: 'device-status-overview',
      label: 'Device status overview',
      description: 'Registered, active, revoked, online-recent, and offline-stale device counts.',
      defaultSelected: true
    },
    {
      id: 'sync-health-summary',
      label: 'Sync health summary',
      description: 'Recent sync coverage, stale syncs, and heartbeat freshness across selected nodes.',
      defaultSelected: true
    },
    {
      id: 'telemetry-snapshot',
      label: 'Telemetry snapshot',
      description: 'Latest battery, signal, GPS, CPU, storage, and RAM readings per node.',
      defaultSelected: true
    },
    {
      id: 'mesh-command-queue',
      label: 'Mesh command queue',
      description: 'Pending, processed, cancelled, and oldest-pending command visibility.',
      defaultSelected: true
    },
    {
      id: 'recent-device-activity',
      label: 'Recent device activity',
      description: 'Per-node operational rows with sync, heartbeat, health, and command context.',
      defaultSelected: true
    },
    {
      id: 'failure-and-gap-indicators',
      label: 'Failure and gap indicators',
      description: 'Nodes missing recent sync, heartbeat, health, or carrying stale pending commands.',
      defaultSelected: true
    }
  ]
});

const ONLINE_COMMUNICATIONS_MODERATION_REPORT = Object.freeze({
  id: 'online-communications-moderation',
  name: 'Online Communications and Moderation Report',
  icon: 'fa-comments',
  description: 'Cloud chat volume, unread load, sender activity, and moderation events.',
  audience: 'Communications desk',
  range: 'Daily to monthly',
  available: true,
  scopeLabel: 'Chat scope',
  supportedDateRanges: ['today', '7d', '30d', 'month', 'custom'],
  supportedSourceScopes: ['all', 'department', 'global'],
  supportedOutputModes: ['briefing', 'archive', 'field'],
  include: [
    {
      id: 'department-chat-volume',
      label: 'Department chat volume',
      description: 'Conversation and sender mix by department room.',
      defaultSelected: true
    },
    {
      id: 'global-announcement-activity',
      label: 'Global announcement activity',
      description: 'Global announcement volume, sender mix, and reader snapshot.',
      defaultSelected: true
    },
    {
      id: 'conversation-load',
      label: 'Conversation load',
      description: 'Open conversations, active threads, and unread snapshot totals.',
      defaultSelected: true
    },
    {
      id: 'sender-activity-breakdown',
      label: 'Sender activity breakdown',
      description: 'Message totals by sender type plus top rooms and conversations.',
      defaultSelected: true
    },
    {
      id: 'moderation-actions',
      label: 'Moderation actions',
      description: 'Blocked messages, spam timeouts, and active sender guard timeouts.',
      defaultSelected: true
    },
    {
      id: 'recent-communication-events',
      label: 'Recent communication events',
      description: 'Recent department, global, and moderation activity rows.',
      defaultSelected: true
    }
  ]
});

function listReportCatalog() {
  return [
    INCIDENT_SUMMARY_REPORT,
    RESCUE_TEAM_ACTIVITY_REPORT,
    ACCOUNTS_ACCESS_AUDIT_REPORT,
    MESH_DEVICE_SYNC_HEALTH_REPORT,
    ONLINE_COMMUNICATIONS_MODERATION_REPORT
  ];
}

function getReportDefinition(reportId) {
  return listReportCatalog().find((report) => report.id === reportId) || null;
}

module.exports = {
  INCIDENT_SUMMARY_REPORT,
  RESCUE_TEAM_ACTIVITY_REPORT,
  ACCOUNTS_ACCESS_AUDIT_REPORT,
  MESH_DEVICE_SYNC_HEALTH_REPORT,
  ONLINE_COMMUNICATIONS_MODERATION_REPORT,
  listReportCatalog,
  getReportDefinition
};
