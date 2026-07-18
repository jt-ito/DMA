#!/usr/bin/env python3
"""
Docker Compose Manager & Full Cleanup (Auto-Prune by Default)
"""

import argparse
import logging
import os
from shutil import SameFileError
import subprocess
import sys
import platform
import yaml
import time
import shutil

from pathlib import Path
from datetime import datetime
from logging.handlers import RotatingFileHandler
from alive_progress import alive_it

REQUIRED_PORTS = [80, 443]

def parse_args():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('-h', '--help', action='help', help='Show this help message and exit')
    parser.add_argument('-c', '--config', default='/home/jt/Scripts/docker_compose_manager_config.json',
                        help='YAML config file defining stacks')
    parser.add_argument('-b', '--backup', action='store_true',
                        help='Backup existing docker-compose.yml and .env before replacing')
    parser.add_argument('-n', '--dry-run', action='store_true',
                        help='Print planned actions without executing them')
    parser.add_argument('-l', '--log-file',
                        help='Optional path to write detailed logs')
    parser.add_argument('--skip-down', action='store_true',
                        help="Skip 'docker compose down'")
    parser.add_argument('--skip-pull', action='store_true',
                        help="Skip 'docker compose pull'")
    parser.add_argument('--skip-up', action='store_true',
                        help="Skip 'docker compose up -d'")
    parser.add_argument('--skip-prune', action='store_true',
                        help="Skip 'docker system prune -a -f'")
    parser.add_argument('--firewall', action='store_true',
                        help='Audit iptables firewall rules for ports 80 & 443')
    return parser.parse_args()

def setup_logging(log_file: str = None):
    logger = logging.getLogger('deploy')
    logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter('[%(asctime)s] %(levelname)s: %(message)s', '%Y-%m-%d %H:%M:%S')
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    if log_file:
        fh = RotatingFileHandler(log_file, maxBytes=2**20, backupCount=5, encoding='utf-8')
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(fmt)
        logger.addHandler(fh)

    return logger

def run_command(cmd: list, cwd: Path = None, logger=None, dry_run=False, stream_output=False):
    if logger:
        logger.info("Running: %s (cwd=%s)", ' '.join(cmd), cwd or os.getcwd())
    if dry_run:
        return 0, '', ''

    try:
        if stream_output:
            proc = subprocess.Popen(cmd, cwd=cwd)
            try:
                proc.wait()
            except KeyboardInterrupt:
                if logger:
                    logger.warning("Received KeyboardInterrupt, terminating subprocess...")
                proc.terminate()
                proc.wait()
                sys.exit(1)
            return proc.returncode, '', ''
        else:
            proc = subprocess.Popen(cmd, cwd=cwd,
                                    stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE,
                                    text=True,
                                    bufsize=1,
                                    universal_newlines=True)
            stdout_lines = []
            stderr_lines = []
            try:
                while True:
                    out_line = proc.stdout.readline()
                    err_line = proc.stderr.readline()

                    if out_line:
                        stdout_lines.append(out_line)
                        if logger:
                            logger.info(out_line.rstrip())
                        else:
                            print(out_line, end='')
                    if err_line:
                        stderr_lines.append(err_line)
                        if logger:
                            logger.error(err_line.rstrip())
                        else:
                            print(err_line, end='')

                    if out_line == '' and err_line == '' and proc.poll() is not None:
                        break
            except KeyboardInterrupt:
                if logger:
                    logger.warning("Received KeyboardInterrupt, terminating subprocess...")
                proc.terminate()
                proc.wait()
                sys.exit(1)

            return proc.returncode, ''.join(stdout_lines), ''.join(stderr_lines)

    except FileNotFoundError:
        if logger:
            logger.error("Command not found: %s", cmd[0])
        sys.exit(10)
    except Exception as e:
        if logger:
            logger.error("Error running command '%s': %s", ' '.join(cmd), e)
        sys.exit(1)

def backup_file(path: Path, backup_root: Path, logger, dry_run=False):
    if not path.exists():
        logger.debug("No existing file to backup at %s", path)
        return
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    dest = backup_root / timestamp / path.name
    logger.info("Backing up %s → %s", path, dest)
    if dry_run:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest)

def copy_file(src: Path, dst: Path, logger, dry_run=False):
    try:
        src_resolved = src.resolve()
        dst_resolved = dst.resolve()
    except Exception as e:
        logger.error("Error resolving paths %s or %s: %s", src, dst, e)
        sys.exit(22)

    if src_resolved == dst_resolved:
        logger.info("Skipping copy; source and destination are the same: %s", src_resolved)
        return

    logger.info("Copying %s → %s", src, dst)
    if dry_run:
        return

    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        logger.debug("Successfully copied %s → %s", src, dst)
    except SameFileError:
        logger.info("Detected same-file on copy attempt, skipping: %s", src)
    except FileNotFoundError:
        logger.error("Source file not found: %s", src)
        sys.exit(20)
    except PermissionError:
        logger.error("Permission denied copying %s → %s", src, dst)
        sys.exit(21)

def ensure_network(networks: list, logger, dry_run=False):
    code, out, _ = run_command(['docker', 'network', 'ls', '--format', '{{.Name}}'], logger=logger, dry_run=dry_run)
    existing = out.splitlines() if code == 0 else []
    for net in networks:
        if net in existing:
            logger.info("Network exists: %s", net)
        else:
            logger.info("Creating network: %s", net)
            run_command(['docker', 'network', 'create', '--driver', 'bridge', net], logger=logger, dry_run=dry_run)

def prune_all_orphans(logger, dry_run=False):
    logger.info("Pruning unused Docker containers, networks, and images")
    run_command(['docker', 'system', 'prune', '-a', '-f'], logger=logger, dry_run=dry_run)

def audit_firewall_linux(logger, ports, dry_run=False):
    if platform.system() != 'Linux':
        logger.info("Skipping firewall audit: not Linux")
        return True
    code, out, err = run_command(['iptables', '-L', 'INPUT', '-n'], logger=logger, dry_run=dry_run)
    if not dry_run and code != 0:
        logger.error("Failed to list iptables INPUT chain: %s", err.strip())
        return False
    return True

def resolve_path(base: Path, value: str, default_name: str) -> Path:
    if not value:
        value = default_name
    path = Path(value)
    return path if path.is_absolute() else base / path

def load_config(path: Path, logger):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
        return data.get('docker_configs', [])
    except FileNotFoundError:
        logger.error("Config file not found: %s", path)
    except PermissionError:
        logger.error("Permission denied reading: %s", path)
    except yaml.YAMLError as e:
        logger.error("YAML parse error in %s: %s", path, e)
    sys.exit(30)

def process_stacks(stacks, action, args, logger):
    for stack in stacks:
        base = Path(stack['docker_dir'])
        compose = resolve_path(base, stack.get('compose_file'), 'docker-compose.yml')
        env = resolve_path(base, stack.get('env_file'), '.env')

        if not compose.exists():
            logger.error("Compose file missing: %s", compose)
        if not env.exists():
            logger.warning("Env file missing: %s", env)

        cmd = ['docker', 'compose', '-f', str(compose), '--env-file', str(env)]
        if action == 'down':
            cmd += ['down']
        elif action == 'pull':
            cmd += ['pull']
        elif action == 'up':
            cmd += ['up', '-d']

        logger.info("=== %s stack at %s ===", action.upper(), base)
        stream_flag = (action == 'pull')
        run_command(cmd, cwd=base, logger=logger, dry_run=args.dry_run, stream_output=stream_flag)
        if not args.dry_run:
            time.sleep(1)

def main():
    args = parse_args()
    logger = setup_logging(args.log_file)
    logger.info("Starting deployment at %s", datetime.now().isoformat())

    stacks = load_config(Path(args.config), logger)
    if not isinstance(stacks, list) or not stacks:
        logger.error("No stacks defined in config.")
        sys.exit(1)

    # Defaults — do everything
    do_down = True
    do_prune = True
    do_pull = True
    do_up = True

    # Apply per-stack config (if any)
    for stack in stacks:
        if stack.get('skip_down'): do_down = False
        if stack.get('skip_prune'): do_prune = False
        if stack.get('skip_pull'): do_pull = False
        if stack.get('skip_up'): do_up = False

    # Apply CLI overrides
    if args.skip_down: do_down = False
    if args.skip_prune: do_prune = False
    if args.skip_pull: do_pull = False
    if args.skip_up: do_up = False

    nets = {n for s in stacks for n in s.get('networks', [])}
    if nets:
        ensure_network(list(nets), logger, args.dry_run)

    if do_down:
        process_stacks(stacks, 'down', args, logger)
    if do_prune:
        prune_all_orphans(logger, args.dry_run)
    if do_pull:
        process_stacks(stacks, 'pull', args, logger)
    if do_up:
        process_stacks(stacks, 'up', args, logger)

    if args.firewall:
        audit_firewall_linux(logger, REQUIRED_PORTS, args.dry_run)

    logger.info("Deployment completed at %s", datetime.now().isoformat())
    sys.exit(0)

if __name__ == "__main__":
    main()
