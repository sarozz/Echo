import type { ConfigPlugin } from '@expo/config-plugins';
import { withEchoMesh } from './withEchoMesh';

const withEcho: ConfigPlugin = (config) => {
  return withEchoMesh(config);
};

export default withEcho;
