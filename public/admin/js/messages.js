(function bootstrapMessagesManagerPage() {
  const modules = window.ResQMeshMessagesModules || {};
  const requiredModules = [
    'createState',
    'createFormatters',
    'createApi',
    'createVoicePlayback',
    'createRender',
    'createMessagesFlow',
    'createEvents'
  ];
  const missingModules = requiredModules.filter((name) => typeof modules[name] !== 'function');

  if (missingModules.length > 0) {
    throw new Error(`Messages Manager failed to load modules: ${missingModules.join(', ')}`);
  }

  const context = {
    ...modules.createState()
  };
  const missingDomKeys = Object.entries(context.dom)
    .filter(([, element]) => !element)
    .map(([key]) => key);

  if (missingDomKeys.length > 0) {
    throw new Error(`Messages Manager failed to find required DOM nodes: ${missingDomKeys.join(', ')}`);
  }

  context.formatters = modules.createFormatters(context);
  context.api = modules.createApi(context);
  context.voice = modules.createVoicePlayback(context);
  context.render = modules.createRender(context);
  context.flow = modules.createMessagesFlow(context);
  context.events = modules.createEvents(context);

  context.events.bindEvents();
  void context.flow.refresh({
    keepDepartmentSelection: false,
    keepConversationSelection: false,
    autoSelectConversation: false,
    forceMessageReload: true,
    scrollToBottom: true
  }).then(context.events.startPolling);
}());
