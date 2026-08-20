module.exports = {
  ...require('./reports/catalogReportService'),
  ...require('./reports/generators/incidentSummaryReport'),
  ...require('./reports/generators/rescueTeamActivityReport'),
  ...require('./reports/generators/accountsAccessAuditReport'),
  ...require('./reports/generators/meshDeviceSyncHealthReport'),
  ...require('./reports/generators/onlineCommunicationsModerationReport')
};
