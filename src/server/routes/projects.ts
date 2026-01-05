import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs-extra';
import { join, basename } from 'path';

// Projects are stored relative to the app root
const PROJECTS_DIR = join(process.cwd(), 'projects');

// Current active project path - mutable for dynamic switching. When null, no project is selected.
let currentProjectPath: string | null = null;

// Ensure projects directory exists
fs.ensureDirSync(PROJECTS_DIR);

// Export functions to get/set current project
export function getCurrentProjectPath(): string | null {
  return currentProjectPath;
}

export function setCurrentProject(projectPath: string | null): void {
  currentProjectPath = projectPath;
  console.log(`[Projects] Switched to project: ${projectPath}`);
}

interface ProjectInfo {
  name: string;
  path: string;
  displayName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default async function projectRoutes(fastify: FastifyInstance) {
  // List all projects
  fastify.get('/api/projects', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await fs.ensureDir(PROJECTS_DIR);
      const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });

      const projects: ProjectInfo[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = join(PROJECTS_DIR, entry.name);
          const mooPath = join(projectPath, '.moo');

          // Only include folders that have a .moo directory (valid projects)
          if (await fs.pathExists(mooPath)) {
            const stat = await fs.stat(mooPath);
            projects.push({
              name: entry.name,
              path: projectPath,
              createdAt: stat.birthtime.toISOString(),
              updatedAt: stat.mtime.toISOString(),
            });
          }
        }
      }

      // Sort by most recently updated
      projects.sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });

      return { projects };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      return { error: 'Failed to list projects' };
    }
  });

  // Create a new project
  fastify.post('/api/projects', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { name?: string } | null;

      if (!body?.name || !body.name.trim()) {
        reply.code(400);
        return { error: 'Project name is required' };
      }

      // Sanitize project name for filesystem
      const safeName = body.name.trim()
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
        .replace(/\s+/g, '-') // Spaces to dashes
        .toLowerCase();

      if (!safeName) {
        reply.code(400);
        return { error: 'Invalid project name' };
      }

      const projectPath = join(PROJECTS_DIR, safeName);

      if (await fs.pathExists(projectPath)) {
        reply.code(400);
        return { error: 'Project already exists' };
      }

      // Create project structure (V2)
      const mooPath = join(projectPath, '.moo');
      await fs.ensureDir(mooPath);

      // V2 Folders
      await fs.ensureDir(join(projectPath, 'actors'));
      await fs.ensureDir(join(projectPath, 'scenes'));
      await fs.ensureDir(join(projectPath, 'global'));

      // Initialize all V2 JSONL files
      const jsonlFiles = [
        'actors.jsonl',
        'scenes.jsonl',
        'bins.jsonl',
        'media.jsonl',
        'takes.jsonl',
        'snapshots.jsonl'
      ];
      for (const file of jsonlFiles) {
        await fs.writeFile(join(mooPath, file), '');
      }

      // Create config file with versioning
      const config = {
        name: body.name.trim(),
        schema_version: '2.0.0',
        created_at: new Date().toISOString(),
      };
      await fs.writeJson(join(mooPath, 'config.json'), config, { spaces: 2 });

      // Create defaults.json from template
      const templatePath = join(process.cwd(), 'src', 'templates', 'defaults.template.json');
      if (await fs.pathExists(templatePath)) {
        const template = await fs.readJson(templatePath);
        await fs.writeJson(join(projectPath, 'defaults.json'), template, { spaces: 2 });
      } else {
        // Fallback if template missing (though it shouldn't be)
        await fs.writeJson(join(projectPath, 'defaults.json'), { schema_version: '2.0.0', content_types: {} }, { spaces: 2 });
      }

      return {
        project: {
          name: safeName,
          displayName: body.name.trim(),
          path: projectPath,
        }
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      return { error: 'Failed to create project' };
    }
  });

  // Delete a project
  fastify.delete('/api/projects/:name', async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    try {
      const { name } = request.params;
      const projectPath = join(PROJECTS_DIR, name);

      if (!await fs.pathExists(projectPath)) {
        reply.code(404);
        return { error: 'Project not found' };
      }

      // Safety check - only delete if it's inside PROJECTS_DIR
      if (!projectPath.startsWith(PROJECTS_DIR)) {
        reply.code(400);
        return { error: 'Invalid project path' };
      }

      await fs.remove(projectPath);

      return { success: true };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      return { error: 'Failed to delete project' };
    }
  });

  // Copy/Save As project
  fastify.post('/api/projects/:name/copy', async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    try {
      const { name } = request.params;
      const body = request.body as { newName?: string } | null;

      if (!body?.newName || !body.newName.trim()) {
        reply.code(400);
        return { error: 'New project name is required' };
      }

      const sourcePath = join(PROJECTS_DIR, name);

      if (!await fs.pathExists(sourcePath)) {
        reply.code(404);
        return { error: 'Source project not found' };
      }

      // Sanitize new name
      const safeName = body.newName.trim()
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();

      const destPath = join(PROJECTS_DIR, safeName);

      if (await fs.pathExists(destPath)) {
        reply.code(400);
        return { error: 'A project with that name already exists' };
      }

      await fs.copy(sourcePath, destPath);

      // Update config with new name
      const configPath = join(destPath, '.moo', 'config.json');
      if (await fs.pathExists(configPath)) {
        const config = await fs.readJson(configPath);
        config.name = body.newName.trim();
        config.copied_from = name;
        config.copied_at = new Date().toISOString();
        await fs.writeJson(configPath, config, { spaces: 2 });
      }

      return {
        project: {
          name: safeName,
          displayName: body.newName.trim(),
          path: destPath,
        }
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      return { error: 'Failed to copy project' };
    }
  });

  // Get current project info
  fastify.get('/api/projects/current', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const currentPath = getCurrentProjectPath();
      if (!currentPath) {
        return { project: null };
      }

      const mooPath = join(currentPath, '.moo');

      if (!await fs.pathExists(mooPath)) {
        return { project: null };
      }

      const configPath = join(mooPath, 'config.json');
      let config: { name?: string } = {};
      if (await fs.pathExists(configPath)) {
        config = await fs.readJson(configPath);
      }

      return {
        project: {
          name: basename(currentPath),
          displayName: config.name || basename(currentPath),
          path: currentPath,
        }
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      return { error: 'Failed to get current project' };
    }
  });

  // Switch to a different project
  fastify.post('/api/projects/switch', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { name?: string } | null;

      if (!body?.name) {
        reply.code(400);
        return { error: 'Project name is required' };
      }

      const projectPath = join(PROJECTS_DIR, body.name);
      const mooPath = join(projectPath, '.moo');

      if (!await fs.pathExists(mooPath)) {
        reply.code(404);
        return { error: 'Project not found' };
      }

      // Switch to the new project
      setCurrentProject(projectPath);

      // Read project config for display name
      const configPath = join(mooPath, 'config.json');
      let config: { name?: string } = {};
      if (await fs.pathExists(configPath)) {
        config = await fs.readJson(configPath);
      }

      return {
        project: {
          name: body.name,
          displayName: config.name || body.name,
          path: projectPath,
        }
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      return { error: 'Failed to switch project' };
    }
  });
}
