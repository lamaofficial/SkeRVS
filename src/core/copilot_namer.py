import asyncio
import logging
import json
from copilot import CopilotClient

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class GroupNamer:
    def __init__(self, model="gpt-5-mini (medium)"):
        self.model = model

    async def name_groups_async(self, groups_dict):
        """
        Names multiple groups efficiently using a single client connection.
        groups_dict: {group_id: [keywords...]}
        Returns: {group_id: "Name"}
        """
        # Default results in case of failure
        results = {gid: f"Group {gid}" for gid in groups_dict}
        
        if not groups_dict:
            return results
        
        client = None
        try:
            client = CopilotClient()
            await client.start()
            
            session = await client.create_session({"model": self.model})
            
            done = asyncio.Event()
            response_text = ""
            
            def on_event(event):
                nonlocal response_text
                if event.type.value == "assistant.message":
                    response_text += event.data.content
                elif event.type.value == "session.idle":
                    done.set()
                    
            session.on(on_event)
            
            # 1. Build the Batch Prompt
            prompt_header = "任务：为以下几组关键词生成简短的类别名称（2-4个词）。\n请严格以JSON格式返回，Key为组ID，Value为名称。\n例如：{\"0\": \"机器学习\", \"1\": \"深度学习\"}\n\n数据：\n"
            
            group_lines = []
            for gid, keywords in groups_dict.items():
                # Take top 8 keywords to save tokens
                top_kws = ", ".join(keywords[:8])
                group_lines.append(f"ID {gid}: {top_kws}")
            
            full_prompt = prompt_header + "\n".join(group_lines) + "\n\n请只返回JSON，不要包含Markdown代码块。"
            
            logging.info(f"[Copilot] Sending Batch Prompt: {full_prompt[:500]}...")
            
            # Send prompt - using direct 'prompt' key as requested
            try:
                await session.send({"prompt": full_prompt})

                # specific timeout handling
                try:
                    await asyncio.wait_for(done.wait(), timeout=45.0) 
                except asyncio.TimeoutError:
                    logging.warning("[Copilot] Timeout waiting for response - falling back to default names.")
                    # Don't destroy immediately, just return defaults to save the user experience
                    try: await session.destroy(); await client.stop() 
                    except: pass
                    return results

            except Exception as e:
                 logging.error(f"[Copilot] Interaction failed: {e}")
                 try: await session.destroy(); await client.stop()
                 except: pass
                 return results
            
            logging.info(f"[Copilot] Received Response: {response_text}")
            
            # 2. Parse JSON Response
            try:
                # Clean up response (remove markdown code blocks if present)
                clean_json = response_text
                if "```json" in clean_json:
                    clean_json = clean_json.split("```json")[1].split("```")[0]
                elif "```" in clean_json:
                    clean_json = clean_json.split("```")[1].split("```")[0]
                
                clean_json = clean_json.strip()
                
                # Parse
                parsed_names = json.loads(clean_json)
                
                # Map back to results
                for gid_str, name in parsed_names.items():
                    # JSON keys are always strings, but our groups_dict might use ints
                    # Try to match both str and int versions of the key
                    if gid_str in groups_dict:
                        results[gid_str] = name
                    else:
                        try:
                            # It's possible the LLM returns keys like "ID 0" or just "0"
                            gid_clean = gid_str.replace("ID ", "").strip()
                            gid_int = int(gid_clean)
                            if gid_int in groups_dict:
                                results[gid_int] = name
                                # logging.info(f"Mapped int key {gid_int} -> {name}")
                            # Also support string keys just in case groups_dict uses strings
                            elif gid_str in groups_dict:
                                results[gid_str] = name
                        except ValueError:
                            # If conversion fails, maybe it's just a string key
                            if gid_str in groups_dict:
                                results[gid_str] = name
                            pass

                logging.info(f"[Copilot] Successfully named {len(parsed_names)} groups. Results sample: {str(list(results.items())[:3])}")
                            
            except json.JSONDecodeError as e:
                logging.error(f"Failed to parse Copilot JSON response: {e}")
                logging.error(f"Raw response was: {response_text}")
                # Fallback to defaults (already set)
            
            await session.destroy()
            await client.stop()
            
            return results
            
        except Exception as e:
            logging.error(f"Copilot client error: {e}")
            if client:
                await client.stop()
            return results

    def name_all_groups(self, groups_dict):
        """
        Synchronous wrapper.
        """
        if not groups_dict:
            return {}
        return asyncio.run(self.name_groups_async(groups_dict))
