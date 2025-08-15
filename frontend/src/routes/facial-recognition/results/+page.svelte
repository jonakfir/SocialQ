<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let score = 0;
	let total = 0;
	let results = [];

	onMount(() => {
		document.title = 'Quiz Result';
		score = localStorage.getItem('quiz_score') || 0;
		total = localStorage.getItem('quiz_total') || 0;
		results = JSON.parse(localStorage.getItem('quiz_results') || '[]');
	});

	function clearAndRestart() {
		localStorage.removeItem('quiz_results');
		localStorage.removeItem('quiz_score');
		localStorage.removeItem('quiz_total');
		goto('/facial-recognition/settings');
	}
</script>

<style>
	@import '/static/style.css';
	.page-container {
		display: flex;
		justify-content: center;   /* horizontal centering */
		align-items: center;       /* vertical centering */
		min-height: 100vh;         /* full viewport height */
		position: relative;        /* needed for absolute-positioned blobs if they stay inside */
	}
	.result-box {
		width: 95%;
		max-width: 600px;
		background: rgba(255, 255, 255, 0.8);
		backdrop-filter: blur(20px);
		padding: 40px;
		border-radius: 20px;
		text-align: center;
		margin: auto;
		box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
		position: relative;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		position: absolute;
		top: 15px;
		left: 15px;
		right: 15px;
		width: calc(100% - 30px);
	}

	.progress-bar {
		display: flex;
		justify-content: center;
		gap: 8px;
		margin-bottom: 25px;
	}

	.progress-dot {
		width: 45px;
		height: 10px;
		border-radius: 5px;
	}

	.correct {
		background: #4CAF50;
	}

	.wrong {
		background: #FF3B30;
	}

	.score-circle {
		width: 200px;
		height: 200px;
		border-radius: 50%;
		background: #4f46e5;
		color: white;
		font-size: 40px;
		font-weight: bold;
		display: flex;
		justify-content: center;
		align-items: center;
		margin: 30px auto;
	}

	.btn {
		display: block;
		width: 80%;
		max-width: 300px;
		padding: 15px;
		margin: 15px auto;
		font-size: 20px;
		font-weight: bold;
		color: black;
		background-color: white;
		border: 2px solid black;
		border-radius: 40px;
		cursor: pointer;
		text-align: center;
		transition: background 0.3s ease;
	}

	.btn:hover {
		background: #4f46e5;
		color: white;
	}
</style>

<!-- Blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="page-container">
	<div class="result-box">
		<h2 style="font-family: Georgia; font-size: 2.5rem;">Great Job!</h2>

		<div class="progress-bar">
			{#each results as res}
				<div class="progress-dot {res ? 'correct' : 'wrong'}"></div>
			{/each}
		</div>

		<div class="score-circle">{score}/{total}</div>

		<button class="btn" on:click={clearAndRestart}>Play Again</button>
		<button class="btn" on:click={() => goto('/facial-recognition/results/stats')}>
			See Stats
			</button>
		<button class="btn" on:click={() => goto('/dashboard')}>Exit</button>
	</div>
</div>
