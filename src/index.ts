import app from "./app";
import client from 'prom-client';

client.collectDefaultMetrics();

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
});

const PORT = process.env.PORT ?? 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
