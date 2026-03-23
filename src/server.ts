import app from './app';
import { env } from './config/env';

const PORT = env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});