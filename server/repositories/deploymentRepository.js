module.exports = {
  ...require('./deployments/codeSequenceRepository'),
  ...require('./deployments/distressRepository'),
  ...require('./deployments/deploymentRecordRepository'),
  ...require('./deployments/rescuerLocationRepository'),
  ...require('./deployments/onlineDistressRepository'),
  ...require('./deployments/routeSnapshotRepository'),
  ...require('./deployments/assignmentRepository'),
  ...require('./deployments/syncDeploymentRepository')
};
