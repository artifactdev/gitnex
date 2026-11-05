//! GitVolt's AI commit-message providers: an OpenAI-compatible HTTP endpoint, or a local
//! command-line tool. Tokens only ever leave in the `Authorization` header; a CLI gets the prompt
//! as an argument, never through a shell.

use gitvolt_core::ai::{AiDetected, AiProvider, AiProviderKind, AiRequest};
use gitvolt_core::error::{GbError, GbErrorKind};
use gitvolt_core::redact::{redact, Secret};
use serde_json::{json, Value};
use std::process::{Command, Stdio};
use std::time::Duration;

const USER_AGENT: &str = concat!("GitVolt/", env!("CARGO_PKG_VERSION"));
const MAX_JSON: u64 = 4 * 1024 * 1024;
const MAX_ERROR: usize = 600;
const DETECT_TIMEOUT: Duration = Duration::from_millis(700);

/// The local OpenAI-compatible servers GitVolt knows to look for.
const LOCAL_SERVERS: &[(&str, &str)] = &[
    ("Ollama", "http://127.0.0.1:11434/v1"),
    ("LM Studio", "http://127.0.0.1:1234/v1"),
    ("llama.cpp", "http://127.0.0.1:8080/v1"),
    ("vLLM", "http://127.0.0.1:8000/v1"),
];

/// The command-line tools offered when found on `PATH`, with the argv template each gets.
const CLIS: &[(&str, &str, &str)] = &[
    ("copilot", "GitHub Copilot CLI", "copilot -s -p {prompt}"),
    ("codex", "OpenAI Codex CLI", "codex exec {prompt}"),
    ("claude", "Claude Code", "claude -p {prompt}"),
    ("gemini", "Gemini CLI", "gemini -p {prompt}"),
    ("llm", "LLM CLI", "llm {prompt}"),
    ("ollama", "Ollama CLI", "ollama run {model} {prompt}"),
];

pub struct Ai {
    agent: ureq::Agent,
    detect_agent: ureq::Agent,
}

impl Default for Ai {
    fn default() -> Self {
        Self::new()
    }
}

impl Ai {
    pub fn new() -> Self {
        Self {
            agent: agent(Duration::from_secs(45)),
            detect_agent: agent(DETECT_TIMEOUT),
        }
    }

    fn models_at(&self, agent: &ureq::Agent, endpoint: &str, token: Option<&Secret>) -> Result<Vec<String>, GbError> {
        let url = format!("{}/models", base(endpoint)?);
        let mut request = agent.get(&url);
        if let Some(token) = token.filter(|t| !t.is_empty()) {
            request = request.header("Authorization", format!("Bearer {}", token.expose()));
        }
        let mut response = request.call().map_err(network)?;
        let status = response.status().as_u16();
        let body = response.body_mut().with_config().limit(MAX_JSON).read_to_string().map_err(network)?;
        if !(200..300).contains(&status) {
            return Err(http_error(status, &body));
        }
        let value: Value = serde_json::from_str(&body).map_err(|e| GbError::new(GbErrorKind::InvalidInput, format!("The AI endpoint sent no readable model list: {e}")))?;
        let mut models: Vec<String> = ["data", "models"]
            .iter()
            .filter_map(|key| value[*key].as_array())
            .flatten()
            .filter_map(|m| m["id"].as_str().or_else(|| m["name"].as_str()).or_else(|| m["model"].as_str()))
            .map(str::to_string)
            .collect();
        models.sort();
        models.dedup();
        Ok(models)
    }
}

impl AiProvider for Ai {
    fn detect(&self) -> Vec<AiDetected> {
        let mut found = Vec::new();
        for (name, endpoint) in LOCAL_SERVERS {
            let Ok(models) = self.models_at(&self.detect_agent, endpoint, None) else { continue };
            found.push(AiDetected {
                id: format!("openai:{endpoint}"),
                name: format!("{name} (local)"),
                provider: AiProviderKind::OpenAi,
                endpoint: (*endpoint).to_string(),
                command: String::new(),
                models,
            });
        }
        for (command, name, template) in CLIS {
            if !on_path(command) {
                continue;
            }
            found.push(AiDetected {
                id: format!("cli:{command}"),
                name: format!("{name} ({command})"),
                provider: AiProviderKind::Cli,
                endpoint: String::new(),
                command: (*template).to_string(),
                models: Vec::new(),
            });
        }
        found
    }

    fn models(&self, endpoint: &str, token: Option<&Secret>) -> Result<Vec<String>, GbError> {
        self.models_at(&self.agent, endpoint, token)
    }

    fn generate(&self, request: &AiRequest<'_>) -> Result<String, GbError> {
        match request.settings.provider {
            AiProviderKind::OpenAi => self.generate_openai(request),
            AiProviderKind::Cli => generate_cli(request),
        }
    }
}

impl Ai {
    fn generate_openai(&self, request: &AiRequest<'_>) -> Result<String, GbError> {
        let endpoint = request.settings.endpoint.trim();
        if endpoint.is_empty() {
            return Err(GbError::new(GbErrorKind::InvalidInput, "Enter an API endpoint first"));
        }
        if request.settings.model.trim().is_empty() {
            return Err(GbError::new(GbErrorKind::InvalidInput, "Choose a model first"));
        }
        let url = chat_url(endpoint)?;
        let body = json!({
            "model": request.settings.model,
            "messages": [{ "role": "user", "content": request.prompt }],
            "temperature": 0.2,
            "stream": false,
        });
        let mut call = self.agent.post(&url).header("Content-Type", "application/json");
        if let Some(token) = request.token.filter(|t| !t.is_empty()) {
            call = call.header("Authorization", format!("Bearer {}", token.expose()));
        }
        let mut response = call.send(body.to_string()).map_err(network)?;
        let status = response.status().as_u16();
        let text = response.body_mut().with_config().limit(MAX_JSON).read_to_string().map_err(network)?;
        if !(200..300).contains(&status) {
            return Err(http_error(status, &text));
        }
        let value: Value = serde_json::from_str(&text).map_err(|e| GbError::new(GbErrorKind::InvalidInput, format!("The AI endpoint sent no readable answer: {e}")))?;
        let content = &value["choices"][0]["message"]["content"];
        let text = if let Some(s) = content.as_str() {
            s.to_string()
        } else if let Some(parts) = content.as_array() {
            parts.iter().filter_map(|p| p["text"].as_str()).collect::<Vec<_>>().join("")
        } else {
            value["choices"][0]["text"].as_str().unwrap_or_default().to_string()
        };
        if text.trim().is_empty() {
            return Err(GbError::new(GbErrorKind::InvalidInput, "The AI endpoint returned an empty message"));
        }
        Ok(text)
    }
}

/// The command template as argv: `{prompt}` and `{model}` become one argument each; no shell.
fn generate_cli(request: &AiRequest<'_>) -> Result<String, GbError> {
    let template = request.settings.command.trim();
    if template.is_empty() {
        return Err(GbError::new(GbErrorKind::InvalidInput, "Enter a command first"));
    }
    if !template.contains("{prompt}") {
        return Err(GbError::new(GbErrorKind::InvalidInput, "The command must contain {prompt}"));
    }
    let model = request.settings.model.trim();
    if template.contains("{model}") && model.is_empty() {
        return Err(GbError::new(GbErrorKind::InvalidInput, "Choose a model for this command first"));
    }
    let args: Vec<String> = template
        .split_whitespace()
        .map(|part| {
            let part = part.replace("{prompt}", request.prompt);
            if model.is_empty() { part } else { part.replace("{model}", model) }
        })
        .collect();
    let Some((program, rest)) = args.split_first() else {
        return Err(GbError::new(GbErrorKind::InvalidInput, "Enter a command first"));
    };
    let output = Command::new(program)
        .args(rest)
        .current_dir(request.worktree)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| GbError::new(GbErrorKind::Network, format!("Couldn't run {program}: {e}")))?;
    if !output.status.success() {
        let stderr = redact(String::from_utf8_lossy(&output.stderr).trim());
        let stderr = truncate(&stderr, MAX_ERROR);
        return Err(GbError::new(GbErrorKind::InvalidInput, if stderr.is_empty() { format!("{program} exited with {}", output.status) } else { format!("{program}: {stderr}") }));
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Err(GbError::new(GbErrorKind::InvalidInput, format!("{program} returned no message")));
    }
    Ok(text)
}

fn agent(timeout: Duration) -> ureq::Agent {
    ureq::Agent::config_builder().timeout_global(Some(timeout)).http_status_as_error(false).max_redirects(0).user_agent(USER_AGENT).build().into()
}

/// The OpenAI base: the endpoint as entered, with `/v1` appended when it doesn't name a version.
fn base(endpoint: &str) -> Result<String, GbError> {
    let endpoint = endpoint.trim().trim_end_matches('/');
    if endpoint.is_empty() {
        return Err(GbError::new(GbErrorKind::InvalidInput, "Enter an API endpoint first"));
    }
    if !(endpoint.starts_with("http://") || endpoint.starts_with("https://")) {
        return Err(GbError::new(GbErrorKind::InvalidInput, "The API endpoint must start with http:// or https://"));
    }
    Ok(if endpoint.ends_with("/v1") { endpoint.to_string() } else { format!("{endpoint}/v1") })
}

fn chat_url(endpoint: &str) -> Result<String, GbError> {
    let endpoint = endpoint.trim().trim_end_matches('/');
    if endpoint.ends_with("/chat/completions") {
        return Ok(endpoint.to_string());
    }
    Ok(format!("{}/chat/completions", base(endpoint)?))
}

fn network(error: ureq::Error) -> GbError {
    GbError::new(GbErrorKind::Network, format!("Couldn't reach the AI endpoint: {}", redact(&error.to_string())))
}

fn http_error(status: u16, body: &str) -> GbError {
    let body = redact(body.trim());
    let body = truncate(&body, MAX_ERROR);
    GbError::new(GbErrorKind::InvalidInput, if body.is_empty() { format!("The AI endpoint answered {status}") } else { format!("The AI endpoint answered {status}: {body}") })
}

fn truncate(text: &str, max: usize) -> &str {
    if text.len() <= max {
        return text;
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

fn on_path(command: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else { return false };
    for dir in std::env::split_paths(&path) {
        let candidates = if cfg!(windows) { vec![dir.join(command), dir.join(format!("{command}.exe")), dir.join(format!("{command}.cmd")), dir.join(format!("{command}.bat"))] } else { vec![dir.join(command)] };
        for candidate in candidates {
            if !candidate.is_file() {
                continue;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if candidate.metadata().map(|m| m.permissions().mode() & 0o111 != 0).unwrap_or(false) {
                    return true;
                }
            }
            #[cfg(not(unix))]
            {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use gitvolt_core::ai::AiCommitSettings;

    #[test]
    fn endpoints_get_their_openai_paths() {
        assert_eq!(base("https://api.openai.com").unwrap(), "https://api.openai.com/v1");
        assert_eq!(base("http://localhost:11434/v1/").unwrap(), "http://localhost:11434/v1");
        assert_eq!(chat_url("https://api.openai.com/v1").unwrap(), "https://api.openai.com/v1/chat/completions");
        assert_eq!(chat_url("https://api.example/v1/chat/completions").unwrap(), "https://api.example/v1/chat/completions");
        assert_eq!(base("ftp://example.com").unwrap_err().kind, GbErrorKind::InvalidInput);
    }

    #[test]
    fn a_cli_command_gets_the_prompt_as_one_argument() {
        let dir = tempfile::tempdir().unwrap();
        let settings = AiCommitSettings { enabled: true, provider: AiProviderKind::Cli, endpoint: String::new(), model: String::new(), command: "printf {prompt}".into() };
        let request = AiRequest { settings: &settings, token: None, prompt: "hello world", worktree: dir.path() };
        assert_eq!(generate_cli(&request).unwrap(), "hello world");
        let settings = AiCommitSettings { command: "printf {model} {prompt}".into(), ..settings };
        let request = AiRequest { settings: &settings, token: None, prompt: "hello world", worktree: dir.path() };
        assert!(generate_cli(&request).unwrap_err().message.contains("Choose a model"));
        let settings = AiCommitSettings { command: "printf no-placeholder".into(), ..settings };
        let request = AiRequest { settings: &settings, token: None, prompt: "hello world", worktree: dir.path() };
        assert!(generate_cli(&request).unwrap_err().message.contains("{prompt}"));
    }
}
