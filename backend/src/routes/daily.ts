import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import { AppError } from '../errors.js';

export default async function dailyRoutes(
  fastify: FastifyInstance,
  options: {
    config: AppConfig;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  // GET /api/v1/daily/latest — metadata for most-recent completed run
  fastify.get('/latest', { config: { rateLimit: options.rateLimit } }, async (request, reply) => {
    const dailyDataDir = path.resolve(options.config.dailyDataDir);
    try {
      const entries = await fs.readdir(dailyDataDir, { withFileTypes: true });
      const dirs = entries
        .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
        .map((entry) => entry.name)
        .sort()
        .reverse();
      
      for (const dir of dirs) {
        const summaryPath = path.join(dailyDataDir, dir, 'pipeline_run_summary.json');
        try {
          const summaryData = await fs.readFile(summaryPath, 'utf-8');
          return reply.status(200).send(JSON.parse(summaryData));
        } catch {
          // ignore and check next
        }
      }
      throw new AppError(404, 'NOT_FOUND', 'No completed daily runs found');
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to read daily data directory');
    }
  });

  // GET /api/v1/daily/:date/map — serve map_recommendations.json for a date
  fastify.get(
    '/:date/map',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      const { date } = request.params as { date: string };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) && date !== 'latest') {
        throw new AppError(400, 'INVALID_REQUEST', 'Invalid date format, use YYYY-MM-DD or latest');
      }

      const dailyDataDir = path.resolve(options.config.dailyDataDir);
      let targetDate = date;

      if (date === 'latest') {
        try {
          const entries = await fs.readdir(dailyDataDir, { withFileTypes: true });
          const dirs = entries
            .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
            .map((entry) => entry.name)
            .sort()
            .reverse();
          
          let found = false;
          for (const d of dirs) {
            const mapPath = path.join(dailyDataDir, d, 'predictions', 'map_recommendations.json');
            try {
              await fs.access(mapPath);
              targetDate = d;
              found = true;
              break;
            } catch {}
          }
          if (!found) {
            throw new AppError(404, 'NOT_FOUND', 'No completed daily maps found');
          }
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(500, 'INTERNAL_ERROR', 'Failed to read daily data directory');
        }
      }

      const mapPath = path.join(dailyDataDir, targetDate, 'predictions', 'map_recommendations.json');
      try {
        const mapData = await fs.readFile(mapPath, 'utf-8');
        reply.header('Content-Type', 'application/json');
        return reply.status(200).send(mapData);
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          throw new AppError(404, 'NOT_FOUND', `Map data not found for date ${targetDate}`);
        }
        throw new AppError(500, 'INTERNAL_ERROR', 'Failed to read map data');
      }
    },
  );

  // POST /api/v1/daily/run — trigger pipeline run
  fastify.post('/run', { config: { rateLimit: options.rateLimit } }, async (request, reply) => {
    const { date, regions, dryRun, skipGee } = (request.body as any) || {};
    
    const targetDate = date || new Date().toISOString().split('T')[0];
    const targetRegions = regions || 'all';

    const projectRoot = path.resolve(path.join(options.config.dailyDataDir, '..', '..'));
    const scriptPath = path.join(projectRoot, 'scripts', 'run_daily_pipeline.py');
    
    const args = ['--date', targetDate, '--regions', targetRegions];
    if (dryRun) args.push('--dry-run');
    if (skipGee) args.push('--skip-gee');
    
    const child = spawn('python', [scriptPath, ...args], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    return reply.status(202).send({
      message: 'Pipeline run triggered',
      date: targetDate,
      regions: targetRegions,
      dryRun: !!dryRun,
      skipGee: !!skipGee
    });
  });
}
