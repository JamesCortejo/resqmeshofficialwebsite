const INCIDENT_SUMMARY_REPORT = Object.freeze({
  id: 'incident-summary',
  name: 'Incident Summary Report',
  icon: 'fa-chart-line',
  description: 'Incident totals, timing, and citywide summary.',
  audience: 'Operations',
  range: 'Flexible',
  available: true,
  supportedDateRanges: ['today', '7d', '30d', 'month'],
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
  supportedDateRanges: ['today', '7d', '30d', 'month'],
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

const PENDING_REPORTS = Object.freeze([
  {
    id: 'distress-incident',
    name: 'Distress Incident Report',
    icon: 'fa-triangle-exclamation',
    description: 'Single incident case record.',
    audience: 'Field command',
    range: 'Single incident',
    available: false,
    pendingMessage: 'Backend generation is not available yet.'
  },
  {
    id: 'device-health',
    name: 'Mesh Node Health Report',
    icon: 'fa-tower-broadcast',
    description: 'Node status, sync health, and telemetry.',
    audience: 'Technical operations',
    range: 'Daily to monthly',
    available: false,
    pendingMessage: 'Backend generation is not available yet.'
  },
  {
    id: 'audit-log',
    name: 'Audit Log Report',
    icon: 'fa-clipboard-check',
    description: 'Admin, deployment, sync, and moderation history.',
    audience: 'Compliance',
    range: 'Custom window',
    available: false,
    pendingMessage: 'Backend generation is not available yet.'
  }
]);

function listReportCatalog() {
  return [INCIDENT_SUMMARY_REPORT, RESCUE_TEAM_ACTIVITY_REPORT, ...PENDING_REPORTS];
}

function getReportDefinition(reportId) {
  return listReportCatalog().find((report) => report.id === reportId) || null;
}

module.exports = {
  INCIDENT_SUMMARY_REPORT,
  RESCUE_TEAM_ACTIVITY_REPORT,
  listReportCatalog,
  getReportDefinition
};
