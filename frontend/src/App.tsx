import { useEffect, useState } from 'react'
import { api, Card, Proposal, Readiness, Task, Team } from './api'

const emptyCard: Card = { title:'', context:'', need:'', users:'', data_materials:'', constraints:'', expected_result:'', success_criteria:'', contact:'', interaction_format:'' }
const labels: Record<keyof Card,string> = { title:'Название кейса', context:'Контекст', need:'Потребность', users:'Пользователи', data_materials:'Данные и материалы', constraints:'Ограничения', expected_result:'Ожидаемый результат', success_criteria:'Критерии успеха', contact:'Контакт бизнеса', interaction_format:'Формат взаимодействия' }
const levelClass = (level?: string) => `level ${level || 'draft'}`

export default function App(){
  const [page,setPage]=useState<'workspace'|'catalog'|'teams'>('workspace')
  const [task,setTask]=useState<Task|null>(null)
  const [catalog,setCatalog]=useState<Task[]>([])
  const [teams,setTeams]=useState<Team[]>([])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const action=async(work:()=>Promise<void>)=>{setBusy(true);setError('');try{await work()}catch(reason){setError(reason instanceof Error?reason.message:'Ошибка запроса')}finally{setBusy(false)}}
  useEffect(()=>{api.teams().then(setTeams).catch(()=>undefined)},[])
  const open=(id:string)=>action(async()=>{setTask(await api.getTask(id));setPage('workspace')})
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><b><span>e</span></b><strong>EduVibe<small>talent network</small></strong></div>
      <span className="side-label">НАВИГАЦИЯ</span>
      <nav>
        <button className={page==='workspace'?'active':''} onClick={()=>setPage('workspace')}><i>⌁</i> Мой кейс</button>
        <button className={page==='catalog'?'active':''} onClick={()=>action(async()=>{setCatalog(await api.catalog());setPage('catalog')})}><i>◫</i> Карта задач</button>
        <button className={page==='teams'?'active':''} onClick={()=>setPage('teams')}><i>◉</i> Команды</button>
      </nav>
      <div className="legend"><span className="side-label">РАЗДЕЛЫ</span><p><i className="dot gold"/> Кейс</p><p><i className="dot mint"/> Поля карточки</p><p><i className="dot violet"/> Команды</p></div>
    </aside>
    <main>
      <header><div><span className="eyebrow">EDUVIBE / РАБОЧЕЕ ПРОСТРАНСТВО</span><h1>{page==='workspace'?'Мой кейс':page==='catalog'?'Карта задач':'Команды'}</h1></div></header>
      {busy&&<div className="loading-line"><i/></div>}
      {error&&<div className="error"><span>!</span>{error}<button onClick={()=>setError('')}>×</button></div>}
      <div className={`page-transition page-${page}`} key={page}>
        {page==='workspace'
          ? <Workspace task={task} setTask={setTask} teams={teams} busy={busy} action={action}/>
          : page==='catalog'
            ? <Catalog tasks={catalog} open={open}/>
            : <Teams teams={teams}/>
        }
      </div>
    </main>
  </div>
}

const caseSections: {id:string; title:string; description:string; fields:(keyof Card)[]}[] = [
  {id:'problem',title:'Проблема',description:'Что происходит и кому нужно решение',fields:['context','need','users']},
  {id:'result',title:'Результат',description:'Что должно измениться и как это проверить',fields:['expected_result','success_criteria']},
  {id:'constraints',title:'Ограничения',description:'Данные, рамки и формат работы',fields:['data_materials','constraints','contact','interaction_format']}
]

function Workspace({task,setTask,teams,busy,action}:{task:Task|null;setTask:(task:Task|null)=>void;teams:Team[];busy:boolean;action:(work:()=>Promise<void>)=>void}){
  const [brief,setBrief]=useState({topic:'',description:''})
  const [tab,setTab]=useState(0)
  const [answers,setAnswers]=useState<Record<string,string>>({})
  const [card,setCard]=useState(emptyCard)
  const [proposals,setProposals]=useState<Proposal[]>([])
  const [milestone,setMilestone]=useState<Proposal|null>(null)
  useEffect(()=>{if(task){setCard(task.card);setAnswers(Object.fromEntries(task.answers.map(item=>[item.question_id,item.text])));api.proposals(task.id).then(setProposals).catch(()=>undefined)}},[task])
  const readiness:Readiness=task?.readiness||{total:0,level:'draft',level_label:'Черновик',breakdown:[],missing_information:[],suggestions:[]}
  const hasUnsavedCard=Boolean(task&&(Object.keys(card) as (keyof Card)[]).some(key=>card[key]!==task.card[key]))
  const update=async(next:Task)=>{setTask(next);setProposals(await api.proposals(next.id).catch(()=>[]))}
  if(!task)return <section className="landing"><div className="landing-copy"><span className="eyebrow">НОВЫЙ КЕЙС</span><h2>Сформулируйте задачу для команды.</h2><p>Начните с темы и краткого описания. Затем уточните детали и соберите карточку на карте разделов.</p><div className="create"><label>ТЕМА<input value={brief.topic} maxLength={120} onChange={event=>setBrief({...brief,topic:event.target.value})} placeholder="Например, логистика"/></label><label>ОПИСАНИЕ ЗАДАЧИ<textarea rows={4} maxLength={5000} value={brief.description} onChange={event=>setBrief({...brief,description:event.target.value})} placeholder="Что происходит сейчас и какой результат нужен?"/></label><button className="primary" disabled={brief.topic.trim().length<2||brief.description.trim().length<10||busy} onClick={()=>action(async()=>setTask(await api.createTask(brief)))}><span>Создать кейс</span><b>→</b></button></div></div><div className="landing-guide glass-panel"><span className="eyebrow">КАК УСТРОЕНА КАРТА</span><div className="guide-root">Кейс</div><div className="guide-branches"><span>Проблема</span><span>Результат</span><span>Ограничения</span></div><p>Заполненные разделы раскроются на поля. Уточняющие вопросы и отклики появятся только после соответствующих действий.</p></div></section>
  return <section><div className="head"><div><span className="eyebrow">МОИ КЕЙСЫ / {task.topic.toUpperCase()}</span><h2>{card.title||'Новый рабочий кейс'}</h2><small>{task.is_published?'Опубликован':task.is_confirmed?'Подтверждён':'Черновик'} · ID {task.id.slice(0,8)}</small></div><div><span className={levelClass(readiness.level)}><i/>{readiness.total}/100 · {readiness.level_label}</span><button className="secondary" disabled={hasUnsavedCard} title={hasUnsavedCard?'Сначала сохраните изменения':''} onClick={()=>setTask(null)}>＋ Новый кейс</button></div></div><div className="steps">{['Карта кейса','Вопросы','Команды'].map((label,index)=><button className={tab===index?'active':''} disabled={hasUnsavedCard&&index!==tab} title={hasUnsavedCard?'Сначала сохраните изменения':''} onClick={()=>setTab(index)} key={label}><b>0{index+1}</b><span>{label}</span></button>)}</div><div className="tab-transition" key={tab}>{tab===0?<CaseMap task={task} card={card} setCard={setCard} busy={busy} action={action} update={update} goQuestions={()=>setTab(1)}/>:tab===1?<Brief task={task} answers={answers} setAnswers={setAnswers} busy={busy} action={action} update={update}/>:<Collab task={task} teams={teams} proposals={proposals} setProposals={setProposals} action={action} milestone={milestone} setMilestone={setMilestone}/>}</div></section>
}

function CaseMap({task,card,setCard,busy,action,update,goQuestions}:{task:Task;card:Card;setCard:(card:Card)=>void;busy:boolean;action:(work:()=>Promise<void>)=>void;update:(task:Task)=>Promise<void>;goQuestions:()=>void}){
  const [sectionId,setSectionId]=useState<string|null>('problem')
  const [field,setField]=useState<keyof Card>('context')
  const section=caseSections.find(item=>item.id===sectionId)
  const filled=(key:keyof Card)=>Boolean(task.card[key].trim())
  const completed=caseSections.filter(item=>item.fields.every(filled)).length
  const dirty=(Object.keys(card) as (keyof Card)[]).some(key=>card[key]!==task.card[key])
  const chooseSection=(id:string)=>{const next=caseSections.find(item=>item.id===id)!;setSectionId(id);setField(next.fields.find(key=>!filled(key))||next.fields[0])}
  const save=()=>action(async()=>update(await api.updateCard(task.id,card)))
  return <div className="case-workspace">
    <div className="case-left">
      <div className="case-progress glass-panel"><div><b>{completed} из 3 разделов заполнено</b><small>Это ориентир по полям; официальный индекс готовности считается сервером.</small></div><div className="case-progress-track" aria-label={`Заполнено ${completed} из 3 разделов`}><i style={{width:`${completed/3*100}%`}}/></div><button className="secondary" disabled={dirty} title={dirty?'Сначала сохраните изменения':''} onClick={goQuestions}>Перейти к вопросам →</button></div>
      <div className="case-canvas glass-panel" aria-label="Карта разделов кейса">
        <p className="canvas-hint">Выберите раздел, затем поле справа. Заполненные поля появляются на карте.</p>
        <button className={`case-root ${sectionId===null?'selected':''}`} onClick={()=>setSectionId(null)} aria-pressed={sectionId===null}><span>КЕЙС</span><strong>{card.title||task.topic}</strong><small>{task.is_published?'Опубликован':task.is_confirmed?'Подтверждён':'Черновик'}</small></button>
        <div className="case-connectors" aria-hidden="true"><i/><i/><i/></div>
        <div className="case-sections">{caseSections.map(item=>{const count=item.fields.filter(filled).length;return <button key={item.id} className={`case-section ${sectionId===item.id?'selected':''}`} onClick={()=>chooseSection(item.id)} aria-pressed={sectionId===item.id}><span className="section-symbol">{item.id==='problem'?'?':item.id==='result'?'↗':'◇'}</span><strong>{item.title}</strong><small>{count} из {item.fields.length} полей</small></button>})}</div>
        {section&&<div className="case-children" key={section.id}><div className="child-heading"><span className="eyebrow">{section.title.toUpperCase()} / СОХРАНЁННОЕ СОДЕРЖИМОЕ</span><span>{section.fields.filter(filled).length} узла</span></div>{section.fields.some(filled)?<div className="child-grid">{section.fields.filter(filled).map(key=><button key={key} className={`child-node ${field===key?'selected':''}`} onClick={()=>setField(key)} aria-pressed={field===key}><i aria-hidden="true"/><span><b>{labels[key]}</b><small>{task.card[key]}</small></span></button>)}</div>:<div className="child-empty">Пока нет заполненных полей. Выберите поле в панели справа.</div>}</div>}
      </div>
      <div className="case-bottom"><span>Индекс готовности: <b>{task.readiness.total}/100</b></span><span className={levelClass(task.readiness.level)}>{task.readiness.level_label}</span>{task.readiness.missing_information.length>0&&<small>Что уточнить: {task.readiness.missing_information.slice(0,2).join(' · ')}</small>}</div>
    </div>
    <aside className="case-inspector glass-panel">{section?<><span className="eyebrow">РАЗДЕЛ КЕЙСА</span><h3>{section.title}</h3><p>{section.description}</p><div className="field-list" aria-label="Поля раздела">{section.fields.map(key=><button key={key} className={field===key?'active':''} onClick={()=>setField(key)}><span>{labels[key]}</span><small>{card[key]!==task.card[key]?'Не сохранено':filled(key)?'Заполнено':'Пусто'}</small></button>)}</div><label className="inspector-field"><span>{labels[field]}</span><textarea rows={8} value={card[field]} onChange={event=>setCard({...card,[field]:event.target.value})} placeholder={`Опишите: ${labels[field].toLowerCase()}`}/><small>{card[field].length} символов · {dirty?'Есть несохранённые изменения':'Без изменений'}</small></label></>:<><span className="eyebrow">ОБЩЕЕ О КЕЙСЕ</span><h3>Основа задачи</h3><p>Тема: {task.topic}</p><div className="source-summary">{task.description}</div><label className="inspector-field"><span>Название кейса</span><input value={card.title} onChange={event=>setCard({...card,title:event.target.value})} placeholder="Короткое название"/></label><small>{dirty?'Есть несохранённые изменения':'Без изменений'}</small></>}
      <div className="inspector-actions"><button className="primary" disabled={busy||!dirty} onClick={save}>Сохранить изменения</button>{!task.is_confirmed?<button className="secondary" disabled={busy||dirty} onClick={()=>action(async()=>update(await api.confirm(task.id)))}>Подтвердить карточку</button>:!task.is_published?<button className="secondary" disabled={busy||dirty} onClick={()=>action(async()=>update(await api.publish(task.id)))}>Опубликовать кейс</button>:<span className="published"><i/> Опубликовано</span>}{dirty&&<small>Сохраните изменения перед подтверждением или публикацией.</small>}</div>
    </aside>
  </div>
}

function Score({readiness}:{readiness:Readiness}){return <aside className="score glass-panel"><div className="score-orbit"><i/><strong>{readiness.total}<small>/100</small></strong></div><span className="eyebrow">ИНДЕКС ГОТОВНОСТИ</span><div className="bar"><i style={{width:`${readiness.total}%`}}/></div><span className={levelClass(readiness.level)}>{readiness.level_label}</span><div className="breakdown">{readiness.breakdown.map(item=><p key={item.field}><span>{item.label}</span><b>{item.points}<small>/{item.max_points}</small></b></p>)}</div>{readiness.missing_information.length>0&&<div className="missing"><b>!</b><span><strong>Усилить сигнал</strong>{readiness.missing_information.slice(0,2).join(' · ')}</span></div>}</aside>}

function Brief({task,answers,setAnswers,busy,action,update}:{task:Task;answers:Record<string,string>;setAnswers:(value:Record<string,string>)=>void;busy:boolean;action:(work:()=>Promise<void>)=>void;update:(task:Task)=>Promise<void>}){return <div className="columns"><div><span className="eyebrow">АНАЛИЗ СВЯЗЕЙ</span><h3>Уточним задачу</h3><div className="source glass-panel"><small>ИСХОДНЫЙ БРИФ</small><p>{task.description}</p><span className="source-node">01</span></div>{!task.questions.length?<div className="callout glass-panel"><div className="ai-glyph">✦</div><div><b>Нужно больше контекста</b><p>AI найдёт слабые связи и задаст минимум три точных вопроса.</p></div><button className="primary" onClick={()=>action(async()=>{const result=await api.clarify(task.id);await update({...task,questions:result.questions,ai_mode:result.ai_mode})})} disabled={busy}>Сформировать вопросы →</button></div>:<div className="questions glass-panel"><div className="question-header"><span className="eyebrow">УТОЧНЯЮЩИЕ УЗЛЫ</span><span className={`ai-mode ${task.ai_mode}`}>{task.ai_mode==='fallback'?'резервный режим':'AI live'}</span></div>{task.questions.map((question,index)=><label className="question" key={question.id}><b>0{index+1}</b><span>{question.text}<textarea rows={3} value={answers[question.id]||''} onChange={event=>setAnswers({...answers,[question.id]:event.target.value})} placeholder="Введите содержательный ответ…"/></span></label>)}<button className="primary" disabled={busy||!Object.values(answers).some(Boolean)} onClick={()=>action(async()=>update(await api.saveAnswers(task.id,task.questions.map(question=>({question_id:question.id,field:question.field,text:answers[question.id]||''})).filter(answer=>answer.text.trim()))))}>Сохранить связи и пересчитать →</button></div>}</div><Score readiness={task.readiness}/></div>}


function Collab({task,teams,proposals,setProposals,action,milestone,setMilestone}:{task:Task;teams:Team[];proposals:Proposal[];setProposals:(items:Proposal[])=>void;action:(work:()=>Promise<void>)=>void;milestone:Proposal|null;setMilestone:(item:Proposal|null)=>void}){
  const [selected,setSelected]=useState<string[]>([])
  const [showForm,setShowForm]=useState(false)
  const [form,setForm]=useState({team_id:'',idea:'',plan:'',duration_days:14,prototype_url:'https://example.com'})
  const [milestoneForm,setMilestoneForm]=useState({result:'',points:10})
  if(!task.is_published)return <div className="locked glass-panel"><div className="locked-node">⌁</div><h3>Узел ещё не опубликован</h3><p>Опубликуйте задачу, чтобы команды увидели её на карте и отправили предложения.</p></div>
  const submit=()=>action(async()=>{const next=await api.createProposal(task.id,form);setProposals([...proposals,next]);setShowForm(false)})
  const decide=()=>action(async()=>setProposals(await api.decide(task.id,selected,proposals.filter(item=>!selected.includes(item.id)).map(item=>item.id))))
  return <div className="collab"><div className="section"><div><span className="eyebrow">ОТКЛИКИ / DECISION MAP</span><h3>{proposals.length} активных связей</h3></div><button className="primary" onClick={()=>setShowForm(true)}>＋ Добавить отклик</button></div><div className="proposal-network">{proposals.map(proposal=><article className={`proposal glass-panel ${selected.includes(proposal.id)?'selected':''}`} key={proposal.id}><input type="checkbox" checked={selected.includes(proposal.id)} onChange={()=>setSelected(selected.includes(proposal.id)?selected.filter(id=>id!==proposal.id):[...selected,proposal.id])}/><div className="proposal-node">{proposal.team.name.slice(0,2).toUpperCase()}</div><div><span className="eyebrow">КОМАНДА / {proposal.status}</span><h3>{proposal.team.name}</h3><p>{proposal.idea}</p><small>◷ {proposal.duration_days} дней · <a href={proposal.prototype_url} target="_blank">Прототип ↗</a> · {proposal.team.progress_points} pts</small>{proposal.status==='selected'&&<button className="secondary milestone-btn" onClick={()=>setMilestone(proposal)}>Подтвердить milestone</button>}</div></article>)}</div>{proposals.length>0&&<div className="decision"><span><b>{selected.length}</b> команд выбрано<small>Решение принимает бизнес</small></span><button className="primary" onClick={decide}>Зафиксировать решение →</button></div>}{showForm&&<div className="modal"><div className="modal-box glass-panel"><button className="close" onClick={()=>setShowForm(false)}>×</button><span className="eyebrow">НОВАЯ СВЯЗЬ</span><h3>Предложение команды</h3><select value={form.team_id} onChange={event=>setForm({...form,team_id:event.target.value})}><option value="">Выберите команду</option>{teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select><textarea placeholder="Идея (минимум 10 символов)" value={form.idea} onChange={event=>setForm({...form,idea:event.target.value})}/><textarea placeholder="План (минимум 10 символов)" value={form.plan} onChange={event=>setForm({...form,plan:event.target.value})}/><div className="modal-row"><input type="number" min="1" max="365" value={form.duration_days} onChange={event=>setForm({...form,duration_days:+event.target.value})}/><input value={form.prototype_url} onChange={event=>setForm({...form,prototype_url:event.target.value})}/></div><button className="primary full" disabled={!form.team_id||form.idea.length<10||form.plan.length<10} onClick={submit}>Отправить отклик</button></div></div>}{milestone&&<div className="modal"><div className="modal-box glass-panel"><button className="close" onClick={()=>setMilestone(null)}>×</button><span className="eyebrow">MILESTONE / {milestone.team.name}</span><h3>Подтвердить этап</h3><textarea placeholder="Результат этапа (минимум 10 символов)" value={milestoneForm.result} onChange={event=>setMilestoneForm({...milestoneForm,result:event.target.value})}/><input type="number" min="1" max="100" value={milestoneForm.points} onChange={event=>setMilestoneForm({...milestoneForm,points:+event.target.value})}/><button className="primary full" disabled={milestoneForm.result.length<10} onClick={()=>action(async()=>{await api.milestone(milestone.id,milestoneForm);setMilestone(null)})}>Подтвердить и начислить баллы</button></div></div>}</div>
}

function Catalog({tasks,open}:{tasks:Task[];open:(id:string)=>void}){return <section className="catalog"><div className="page-intro"><span className="eyebrow live"><i/> ОТКРЫТЫЕ ВОЗМОЖНОСТИ</span><h2>Карта задач</h2><p>Опубликованные кейсы расположены по индексу готовности.</p></div><div className="grid">{tasks.map((task,index)=><article className={`task glass-panel tone-${index%3}`} key={task.id} onClick={()=>open(task.id)}><div className="task-orbit"><i/><span>{task.readiness.total}</span></div><div className="task-top"><span className="tag">{task.topic}</span><span className={levelClass(task.readiness.level)}>{task.readiness.level_label}</span></div><h3>{task.card.title||'Задача без названия'}</h3><p>{task.card.context||task.description}</p><div className="card-link"><span>CASE / {task.id.slice(0,5)}</span><b>Исследовать →</b></div></article>)}</div>{!tasks.length&&<div className="empty glass-panel"><div className="locked-node">○</div><h3>Карта пока пуста</h3><p>Опубликованные кейсы появятся здесь.</p></div>}</section>}

function Teams({teams}:{teams:Team[]}){return <section><div className="page-intro"><span className="eyebrow live"><i/> STUDENT NETWORK</span><h2>Созвездие команд</h2><p>Профили команд, их технологии и накопленные баллы.</p></div><div className="grid team-grid">{teams.map((team,index)=><article className="team glass-panel" key={team.id}><div className={`team-node node-${index%3}`}><span>{String.fromCharCode(65+index)}</span></div><div className="team-title"><h3>{team.name}</h3><b>{team.progress_points} pts</b></div><p>{team.interests.join(' · ')}</p><div>{team.technologies.map(item=><span className="tag" key={item}>{item}</span>)}</div><footer><span>SKILLS</span>{team.skills.join(' · ')}</footer></article>)}</div></section>}
