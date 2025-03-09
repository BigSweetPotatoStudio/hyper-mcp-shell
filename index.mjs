import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import spawn from "cross-spawn";
import os from "os";
import fs from "fs";
import iconv from "iconv-lite";

import { execSync } from "child_process";

// Create an MCP server
const server = new McpServer({
  name: "hyper-mcp-shell",
  version: "1.0.0",
});

// Add an addition tool
server.tool(
  "execute-command",
  `The current OS is ${os.platform}. Executing command`,
  { command: z.string() },
  async ({ command }) => {
    // let [c, ...args] = command.split(" ");
    // fs.writeFileSync("test.txt", JSON.stringify({ c, args }));
    let result = await spawnWithOutput(command, {
      shell: true,
    });
    // console.log(result);
    return {
      content: [{ type: "text", text: result.stdout }],
    };
  }
);

// 获取系统编码
function getSystemEncoding() {
  try {
    // Windows 系统
    if (process.platform === "win32") {
      const codepage = execSync("chcp", { encoding: "utf8" });
      const match = codepage.match(/(\d+)/);
      if (match) {
        const cp = match[1];
        switch (cp) {
          case "936":
            return "gbk"; // 简体中文
          case "950":
            return "big5"; // 繁体中文
          case "932":
            return "shift_jis"; // 日语
          case "949":
            return "euc-kr"; // 韩语
          default:
            return "utf8";
        }
      }
    }
    // Linux/macOS 系统
    else {
      // 检查环境变量
      const envEncoding =
        process.env.LANG || process.env.LC_ALL || process.env.LC_CTYPE || "";

      if (envEncoding.includes("UTF-8") || envEncoding.includes("utf8")) {
        return "utf8";
      }

      // 其他编码映射
      if (envEncoding.includes("GB") || envEncoding.includes("zh_CN")) {
        return "gbk";
      }
      if (envEncoding.includes("BIG5") || envEncoding.includes("zh_TW")) {
        return "big5";
      }
      if (envEncoding.includes("SJIS") || envEncoding.includes("ja_JP")) {
        return "shift_jis";
      }
      if (envEncoding.includes("EUC-KR") || envEncoding.includes("ko_KR")) {
        return "euc-kr";
      }

      // 也可以尝试从系统命令获取
      try {
        const locale = execSync("locale -k LC_CTYPE", { encoding: "utf8" });
        if (locale.includes("charmap=") && locale.includes("UTF-8")) {
          return "utf8";
        }
      } catch (e) {
        // 忽略错误
      }
    }

    // 默认返回 utf8，大多数 Linux/macOS 系统默认使用 UTF-8
    return "utf8";
  } catch (error) {
    console.error("获取系统编码失败:", error);
    return "utf8"; // 出错时默认为 UTF-8
  }
}

const spawnWithOutput = (command, args, options) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      ...options,
    });
    let stdout = "";
    let stderr = "";

    // proc.stdout.pipe(process.stdout);
    // proc.stderr.pipe(process.stderr);

    proc.stdout.on("data", (data) => {
      const convertedData = iconv.decode(data, getSystemEncoding());
      process.stdout.write(convertedData);
      stdout += convertedData;
    });

    proc.stderr.on("data", (data) => {
      const convertedData = iconv.decode(data, getSystemEncoding());
      process.stderr.write(convertedData);
      stderr += convertedData.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}\n${stderr}`));
      } else {
        resolve({
          stdout,
          stderr,
          code,
        });
      }
    });

    proc.on("error", (err) => {
      reject(new Error(err.message + "\n" + stderr));
    });
  });
};

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
